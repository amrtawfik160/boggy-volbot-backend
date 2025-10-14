import { Controller, Get, Post, Patch, Body, Param, Query, UseGuards, HttpException, HttpStatus, ValidationPipe, Req, Inject } from '@nestjs/common'
import { Throttle } from '@nestjs/throttler'
import { SupabaseAuthGuard } from '../../guards/supabase-auth.guard'
import { CurrentUser } from '../../decorators/user.decorator'
import { RequestId } from '../../decorators/request-id.decorator'
import { SupabaseService } from '../../services/supabase.service'
import { CampaignWebSocketGateway } from '../../websocket/websocket.gateway'
import { MetricsService } from '../../metrics/metrics.service'
import { Queue } from 'bullmq'
import { createRedisClient } from '../../config/redis.config'
import { CreateCampaignDto, UpdateCampaignDto, DistributeDto, SellOnlyDto } from './dto'
import { PaginationDto, createPaginationMeta } from '../../common/pagination.dto'
import { createLogger, createChildLogger } from '../../config/logger'
import type { Request } from 'express'

@Controller('campaigns')
@UseGuards(SupabaseAuthGuard)
export class CampaignsController {
    private gatherQueue: Queue
    private tradeBuyQueue: Queue
    private tradeSellQueue: Queue
    private distributeQueue: Queue
    private fundsGatherQueue: Queue
    private logger = createLogger({ name: 'campaigns-controller' })

    constructor(
        private readonly supabase: SupabaseService,
        private readonly gateway: CampaignWebSocketGateway,
        private readonly metricsService: MetricsService,
    ) {
        // Use dedicated Redis connection for BullMQ queues
        // BullMQ needs its own connection for optimal performance and isolation
        const redisConnection = createRedisClient({
            maxRetriesPerRequest: null, // BullMQ handles retries
            enableReadyCheck: false, // BullMQ doesn't need ready check
        })

        this.gatherQueue = new Queue('gather', { connection: redisConnection })
        this.tradeBuyQueue = new Queue('trade.buy', { connection: redisConnection })
        this.tradeSellQueue = new Queue('trade.sell', { connection: redisConnection })
        this.distributeQueue = new Queue('distribute', { connection: redisConnection })
        this.fundsGatherQueue = new Queue('funds.gather', { connection: redisConnection })
    }

    @Get()
    async listCampaigns(@CurrentUser() user: any, @Query() pagination: PaginationDto) {
        const page = pagination.page || 1
        const limit = Math.min(pagination.limit || 20, 100)

        // Get all campaigns for user (temporary until we add pagination to Supabase service)
        const allCampaigns = await this.supabase.getCampaignsByUserId(user.id)

        // Paginate in-memory
        const startIndex = (page - 1) * limit
        const endIndex = startIndex + limit
        const paginatedCampaigns = allCampaigns.slice(startIndex, endIndex)

        return {
            data: paginatedCampaigns,
            pagination: createPaginationMeta(page, limit, allCampaigns.length),
        }
    }

    @Get(':id')
    async getCampaign(@Param('id') id: string, @CurrentUser() user: any) {
        return await this.supabase.getCampaignById(id, user.id)
    }

    @Post()
    async createCampaign(@Body() dto: CreateCampaignDto, @CurrentUser() user: any) {
        // Validate token exists
        const token = await this.supabase.getTokenById(dto.token_id)
        if (!token) {
            throw new HttpException('Token not found', HttpStatus.NOT_FOUND)
        }

        // Create campaign
        const campaign = await this.supabase.createCampaign({
            user_id: user.id,
            name: dto.name,
            token_id: dto.token_id,
            pool_id: dto.pool_id,
            params: dto.params,
            status: 'draft',
        })

        return campaign
    }

    @Patch(':id')
    async updateCampaign(@Param('id') id: string, @Body() dto: UpdateCampaignDto, @CurrentUser() user: any) {
        return await this.supabase.updateCampaign(id, user.id, dto)
    }

    @Post(':id/start')
    @Throttle({ 'campaign-start': { limit: 5, ttl: 60000 } })
    async startCampaign(@Param('id') id: string, @CurrentUser() user: any, @RequestId() requestId: string) {
        const contextLogger = createChildLogger(this.logger, { userId: user.id, campaignId: id, requestId });

        contextLogger.info('Starting campaign');

        const campaign = await this.supabase.getCampaignById(id, user.id)
        if (!campaign) {
            contextLogger.warn('Campaign not found');
            throw new HttpException('Campaign not found', HttpStatus.NOT_FOUND)
        }

        // Update campaign status
        await this.supabase.updateCampaign(id, user.id, { status: 'active' })
        contextLogger.info('Campaign status updated to active');

        // Update active campaigns metric
        await this.updateActiveCampaignsMetric();

        // Create campaign run
        const run = await this.supabase.createCampaignRun({
            campaign_id: id,
            status: 'running',
        })
        contextLogger.info({ runId: run.id }, 'Campaign run created');

        // Emit run status event
        this.gateway.emitRunStatus({
            runId: run.id,
            campaignId: id,
            status: 'running',
            startedAt: run.started_at,
            
        })

        // Create DB job for gather
        const dbJob = await this.supabase.createJob({
            run_id: run.id,
            queue: 'gather',
            type: 'gather-pool-info',
            payload: { campaignId: id, poolId: campaign.pool_id },
            status: 'queued',
        })

        // Emit job status event
        this.gateway.emitJobStatus({
            jobId: dbJob.id,
            runId: run.id,
            campaignId: id,
            status: 'queued',
            queue: 'gather',
            type: 'gather-pool-info',
            
        })

        // Enqueue initial gather job
        await this.gatherQueue.add('gather-pool-info', {
            runId: run.id,
            campaignId: id,
            poolId: campaign.pool_id,
            dbJobId: dbJob.id,
        })
        contextLogger.info({ jobId: dbJob.id }, 'Gather job enqueued');

        // Bootstrap initial buy/sell for user's active wallets
        const wallets = await this.supabase.getWalletsByUserId(user.id)
        contextLogger.info({ walletCount: wallets.length }, 'Fetched user wallets');

        // Load per-user settings with defaults
        const settings = await this.supabase.getUserSettings(user.id)
        const tradingCfg = settings?.trading_config || {}
        const minAmount =
            tradingCfg.buyLowerAmount != null
                ? Number(tradingCfg.buyLowerAmount)
                : process.env.BUY_LOWER_AMOUNT
                  ? Number(process.env.BUY_LOWER_AMOUNT)
                  : 0.001
        const maxAmount =
            tradingCfg.buyUpperAmount != null
                ? Number(tradingCfg.buyUpperAmount)
                : process.env.BUY_UPPER_AMOUNT
                  ? Number(process.env.BUY_UPPER_AMOUNT)
                  : 0.002

        for (const w of wallets) {
            const amount = Number((Math.random() * (maxAmount - minAmount) + minAmount).toFixed(6))

            // Create DB buy job
            const buyDbJob = await this.supabase.createJob({
                run_id: run.id,
                queue: 'trade.buy',
                type: 'buy-token',
                payload: { campaignId: id, walletId: w.id, amount },
                status: 'queued',
            })

            // Enqueue buy
            await this.tradeBuyQueue.add(
                'buy-token',
                { runId: run.id, campaignId: id, walletId: w.id, amount, dbJobId: buyDbJob.id },
                { delay: Math.round(Math.random() * 2000 + 1000) }
            )

            // Create DB sell job
            const sellDbJob = await this.supabase.createJob({
                run_id: run.id,
                queue: 'trade.sell',
                type: 'sell-token',
                payload: { campaignId: id, walletId: w.id },
                status: 'queued',
            })

            // Enqueue sell ~30s after buy
            await this.tradeSellQueue.add('sell-token', { runId: run.id, campaignId: id, walletId: w.id, dbJobId: sellDbJob.id }, { delay: 30000 })
        }

        return { campaign, run }
    }

    @Post(':id/pause')
    async pauseCampaign(@Param('id') id: string, @CurrentUser() user: any) {
        const campaign = await this.supabase.getCampaignById(id, user.id)
        if (!campaign) {
            throw new HttpException('Campaign not found', HttpStatus.NOT_FOUND)
        }

        // Update campaign status
        await this.supabase.updateCampaign(id, user.id, { status: 'paused' })

        // Update active campaigns metric
        await this.updateActiveCampaignsMetric();

        // Get active run
        const runs = await this.supabase.getCampaignRunsByCampaignId(id)
        if (runs && runs.length > 0) {
            const activeRun = runs.find(r => r.status === 'running')
            if (activeRun) {
                const updatedRun = await this.supabase.updateCampaignRun(activeRun.id, { status: 'paused' })

                // Emit run status event
                this.gateway.emitRunStatus({
                    runId: updatedRun.id,
                    campaignId: id,
                    status: 'paused',
                    startedAt: updatedRun.started_at,
                    endedAt: updatedRun.ended_at,
                    
                })

                // Pause jobs in all queues for this campaign
                const queues = [this.gatherQueue, this.tradeBuyQueue, this.tradeSellQueue]
                for (const queue of queues) {
                    const jobs = await queue.getJobs(['waiting', 'active'])
                    for (const job of jobs) {
                        if (job.data.campaignId === id) {
                            await job.remove()
                        }
                    }
                }
            }
        }

        return { status: 'paused' }
    }

    @Post(':id/resume')
    async resumeCampaign(@Param('id') id: string, @CurrentUser() user: any) {
        const campaign = await this.supabase.getCampaignById(id, user.id)
        if (!campaign) {
            throw new HttpException('Campaign not found', HttpStatus.NOT_FOUND)
        }

        if (campaign.status !== 'paused') {
            throw new HttpException('Campaign must be paused to resume', HttpStatus.BAD_REQUEST)
        }

        // Update campaign status
        await this.supabase.updateCampaign(id, user.id, { status: 'active' })

        // Get paused run
        const runs = await this.supabase.getCampaignRunsByCampaignId(id)
        if (runs && runs.length > 0) {
            const pausedRun = runs.find(r => r.status === 'paused')
            if (pausedRun) {
                const updatedRun = await this.supabase.updateCampaignRun(pausedRun.id, { status: 'running' })

                // Emit run status event
                this.gateway.emitRunStatus({
                    runId: updatedRun.id,
                    campaignId: id,
                    status: 'running',
                    startedAt: updatedRun.started_at,
                    endedAt: updatedRun.ended_at,
                    
                })

                // Re-enqueue buy/sell jobs for active wallets
                const wallets = await this.supabase.getWalletsByUserId(user.id)
                const settings = await this.supabase.getUserSettings(user.id)
                const tradingCfg = settings?.trading_config || {}
                const minAmount =
                    tradingCfg.buyLowerAmount != null
                        ? Number(tradingCfg.buyLowerAmount)
                        : process.env.BUY_LOWER_AMOUNT
                          ? Number(process.env.BUY_LOWER_AMOUNT)
                          : 0.001
                const maxAmount =
                    tradingCfg.buyUpperAmount != null
                        ? Number(tradingCfg.buyUpperAmount)
                        : process.env.BUY_UPPER_AMOUNT
                          ? Number(process.env.BUY_UPPER_AMOUNT)
                          : 0.002

                for (const w of wallets) {
                    const amount = Number((Math.random() * (maxAmount - minAmount) + minAmount).toFixed(6))

                    // Create DB buy job
                    const buyDbJob = await this.supabase.createJob({
                        run_id: pausedRun.id,
                        queue: 'trade.buy',
                        type: 'buy-token',
                        payload: { campaignId: id, walletId: w.id, amount },
                        status: 'queued',
                    })

                    // Enqueue buy
                    await this.tradeBuyQueue.add(
                        'buy-token',
                        { runId: pausedRun.id, campaignId: id, walletId: w.id, amount, dbJobId: buyDbJob.id },
                        { delay: Math.round(Math.random() * 2000 + 1000) }
                    )

                    // Create DB sell job
                    const sellDbJob = await this.supabase.createJob({
                        run_id: pausedRun.id,
                        queue: 'trade.sell',
                        type: 'sell-token',
                        payload: { campaignId: id, walletId: w.id },
                        status: 'queued',
                    })

                    // Enqueue sell ~30s after buy
                    await this.tradeSellQueue.add(
                        'sell-token',
                        { runId: pausedRun.id, campaignId: id, walletId: w.id, dbJobId: sellDbJob.id },
                        { delay: 30000 }
                    )
                }
            }
        }

        return { status: 'resumed' }
    }

    @Post(':id/stop')
    async stopCampaign(@Param('id') id: string, @CurrentUser() user: any) {
        const campaign = await this.supabase.getCampaignById(id, user.id)
        if (!campaign) {
            throw new HttpException('Campaign not found', HttpStatus.NOT_FOUND)
        }

        // Update campaign status
        await this.supabase.updateCampaign(id, user.id, { status: 'stopped' })

        // Update active campaigns metric
        await this.updateActiveCampaignsMetric();

        // Get active run
        const runs = await this.supabase.getCampaignRunsByCampaignId(id)
        if (runs && runs.length > 0) {
            const activeRun = runs.find(r => r.status === 'running' || r.status === 'paused')
            if (activeRun) {
                const updatedRun = await this.supabase.updateCampaignRun(activeRun.id, {
                    status: 'stopped',
                    ended_at: new Date(),
                })

                // Emit run status event
                this.gateway.emitRunStatus({
                    runId: updatedRun.id,
                    campaignId: id,
                    status: 'stopped',
                    startedAt: updatedRun.started_at,
                    endedAt: updatedRun.ended_at,
                    
                })

                // Remove all jobs from queues for this campaign
                const queues = [this.gatherQueue, this.tradeBuyQueue, this.tradeSellQueue]
                for (const queue of queues) {
                    const jobs = await queue.getJobs(['waiting', 'active', 'delayed'])
                    for (const job of jobs) {
                        if (job.data.campaignId === id) {
                            await job.remove()
                        }
                    }
                }
            }
        }

        return { status: 'stopped' }
    }

    @Get(':id/runs')
    async getCampaignRuns(
        @Param('id') id: string,
        @CurrentUser() user: any,
        @Query() pagination: PaginationDto
    ) {
        // Verify user owns the campaign
        const campaign = await this.supabase.getCampaignById(id, user.id)
        if (!campaign) {
            throw new HttpException('Campaign not found', HttpStatus.NOT_FOUND)
        }

        const page = pagination.page || 1
        const limit = Math.min(pagination.limit || 20, 100)

        // Get all runs (temporary until we add pagination to Supabase service)
        const allRuns = await this.supabase.getCampaignRunsByCampaignId(id)

        // Paginate in-memory
        const startIndex = (page - 1) * limit
        const endIndex = startIndex + limit
        const paginatedRuns = allRuns.slice(startIndex, endIndex)

        return {
            data: paginatedRuns,
            pagination: createPaginationMeta(page, limit, allRuns.length),
        }
    }

    @Get(':id/logs')
    async getCampaignLogs(
        @Param('id') id: string,
        @CurrentUser() user: any,
        @Query() pagination: PaginationDto
    ) {
        // Verify user owns the campaign
        const campaign = await this.supabase.getCampaignById(id, user.id)
        if (!campaign) {
            throw new HttpException('Campaign not found', HttpStatus.NOT_FOUND)
        }

        const page = pagination.page || 1
        const limit = Math.min(pagination.limit || 100, 500) // Allow higher limit for logs

        // Get all logs (temporary until we add pagination to Supabase service)
        const allLogs = await this.supabase.getCampaignLogs(id, 10000) // Get large number

        // Paginate in-memory
        const startIndex = (page - 1) * limit
        const endIndex = startIndex + limit
        const paginatedLogs = allLogs.slice(startIndex, endIndex)

        return {
            data: paginatedLogs,
            pagination: createPaginationMeta(page, limit, allLogs.length),
        }
    }

    @Get(':id/status')
    async getCampaignStatus(@Param('id') id: string, @CurrentUser() user: any) {
        const campaign = await this.supabase.getCampaignById(id, user.id)
        if (!campaign) {
            throw new HttpException('Campaign not found', HttpStatus.NOT_FOUND)
        }

        const runs = await this.supabase.getCampaignRunsByCampaignId(id)
        const latestRun = runs[0]

        // Get queue stats
        const gatherWaiting = await this.gatherQueue.getWaitingCount()
        const gatherActive = await this.gatherQueue.getActiveCount()
        const buyWaiting = await this.tradeBuyQueue.getWaitingCount()
        const buyActive = await this.tradeBuyQueue.getActiveCount()
        const sellWaiting = await this.tradeSellQueue.getWaitingCount()
        const sellActive = await this.tradeSellQueue.getActiveCount()

        return {
            campaign,
            latestRun,
            queueStats: {
                gather: { waiting: gatherWaiting, active: gatherActive },
                buy: { waiting: buyWaiting, active: buyActive },
                sell: { waiting: sellWaiting, active: sellActive },
            },
        }
    }

    @Post(':id/distribute')
    @Throttle({ 'campaign-start': { limit: 5, ttl: 60000 } })
    async distribute(
        @Param('id') id: string,
        @CurrentUser() user: any,
        @Body() body: DistributeDto
    ) {
        const campaign = await this.supabase.getCampaignById(id, user.id)
        if (!campaign) {
            throw new HttpException('Campaign not found', HttpStatus.NOT_FOUND)
        }

        // Determine number of wallets to distribute
        const distributionNum = body?.num_wallets || Number(process.env.DISTRIBUTE_WALLET_NUM) || 5

        if (distributionNum < 1 || distributionNum > 100) {
            throw new HttpException('num_wallets must be between 1 and 100', HttpStatus.BAD_REQUEST)
        }

        // Ensure there is a running run
        const run = await this.supabase.createCampaignRun({ campaign_id: id, status: 'running' })

        // Emit run status event
        this.gateway.emitRunStatus({
            runId: run.id,
            campaignId: id,
            status: 'running',
            startedAt: run.started_at,
            
        })

        const dbJob = await this.supabase.createJob({
            run_id: run.id,
            queue: 'distribute',
            type: 'distribute-wallets',
            payload: { campaignId: id, distributionNum },
            status: 'queued',
        })

        await this.distributeQueue.add('distribute-wallets', {
            runId: run.id,
            campaignId: id,
            distributionNum,
            dbJobId: dbJob.id,
        })

        return { status: 'queued', distributionNum, run }
    }

    @Post(':id/sell-only')
    @Throttle({ 'campaign-start': { limit: 5, ttl: 60000 } })
    async startSellOnly(
        @Param('id') id: string,
        @CurrentUser() user: any,
        @Body() body: SellOnlyDto
    ) {
        const campaign = await this.supabase.getCampaignById(id, user.id)
        if (!campaign) {
            throw new HttpException('Campaign not found', HttpStatus.NOT_FOUND)
        }

        // Get total_times from body, user settings, or default to 1
        const settings = await this.supabase.getUserSettings(user.id)
        const totalTimes =
            body?.total_times ||
            (settings?.sell_config?.sellAllByTimes ? Number(settings.sell_config.sellAllByTimes) : 1)

        if (totalTimes < 1 || totalTimes > 20) {
            throw new HttpException('total_times must be between 1 and 20', HttpStatus.BAD_REQUEST)
        }

        await this.supabase.updateCampaign(id, user.id, { status: 'active' })
        const run = await this.supabase.createCampaignRun({ campaign_id: id, status: 'running' })

        // Emit run status event
        this.gateway.emitRunStatus({
            runId: run.id,
            campaignId: id,
            status: 'running',
            startedAt: run.started_at,
            
        })

        // Fetch user's active wallets
        const wallets = await this.supabase.getWalletsByUserId(user.id)

        for (const w of wallets) {
            // Create DB job
            const dbJob = await this.supabase.createJob({
                run_id: run.id,
                queue: 'trade.sell',
                type: 'sell-token',
                payload: { campaignId: id, walletId: w.id, mode: 'sell-only', totalTimes, stepIndex: 1 },
                status: 'queued',
            })

            // Enqueue sell job with mode=sell-only to prevent loop
            await this.tradeSellQueue.add('sell-token', {
                runId: run.id,
                campaignId: id,
                walletId: w.id,
                mode: 'sell-only',
                totalTimes,
                stepIndex: 1,
                dbJobId: dbJob.id,
            })
        }

        return { status: 'queued', run, totalTimes, walletsQueued: wallets.length }
    }

    @Post(':id/gather-funds')
    @Throttle({ 'campaign-start': { limit: 5, ttl: 60000 } })
    async gatherFunds(@Param('id') id: string, @CurrentUser() user: any) {
        const campaign = await this.supabase.getCampaignById(id, user.id)
        if (!campaign) {
            throw new HttpException('Campaign not found', HttpStatus.NOT_FOUND)
        }

        const run = await this.supabase.createCampaignRun({ campaign_id: id, status: 'running' })

        // Emit run status event
        this.gateway.emitRunStatus({
            runId: run.id,
            campaignId: id,
            status: 'running',
            startedAt: run.started_at,
            
        })

        const dbJob = await this.supabase.createJob({
            run_id: run.id,
            queue: 'funds.gather',
            type: 'gather-funds',
            payload: { campaignId: id },
            status: 'queued',
        })

        await this.fundsGatherQueue.add('gather-funds', {
            campaignId: id,
            dbJobId: dbJob.id,
        })

        return { status: 'queued' }
    }

    private async updateActiveCampaignsMetric(): Promise<void> {
        try {
            const { data: campaigns } = await this.supabase.getClient()
                .from('campaigns')
                .select('id')
                .eq('status', 'active');

            const activeCount = campaigns?.length || 0;
            this.metricsService.activeCampaignsGauge.set(activeCount);
        } catch (error) {
            this.logger.error({ error }, 'Failed to update active campaigns metric');
        }
    }
}
