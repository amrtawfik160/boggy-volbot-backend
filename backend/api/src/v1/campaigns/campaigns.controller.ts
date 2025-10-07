import { Controller, Get, Post, Patch, Body, Param, Query, UseGuards, HttpException, HttpStatus } from '@nestjs/common'
import { SupabaseAuthGuard } from '../../guards/supabase-auth.guard'
import { CurrentUser } from '../../decorators/user.decorator'
import { SupabaseService } from '../../services/supabase.service'
import { Queue } from 'bullmq'
import IORedis from 'ioredis'

interface CreateCampaignDto {
    name: string
    token_id: string
    pool_id: string
    params: {
        slippage?: number
        minTxSize?: number
        maxTxSize?: number
        targetVolume?: number
        schedule?: string
        useJito?: boolean
        jitoTip?: number
    }
}

interface UpdateCampaignDto {
    name?: string
    params?: any
}

@Controller('campaigns')
@UseGuards(SupabaseAuthGuard)
export class CampaignsController {
    private gatherQueue: Queue
    private tradeBuyQueue: Queue
    private tradeSellQueue: Queue
    private distributeQueue: Queue
    private fundsGatherQueue: Queue

    constructor(private readonly supabase: SupabaseService) {
        const redisConnection = new IORedis(process.env.REDIS_URL || 'redis://localhost:6379')

        this.gatherQueue = new Queue('gather', { connection: redisConnection })
        this.tradeBuyQueue = new Queue('trade.buy', { connection: redisConnection })
        this.tradeSellQueue = new Queue('trade.sell', { connection: redisConnection })
        this.distributeQueue = new Queue('distribute', { connection: redisConnection })
        this.fundsGatherQueue = new Queue('funds.gather', { connection: redisConnection })
    }

    @Get()
    async listCampaigns(@CurrentUser() user: any) {
        return await this.supabase.getCampaignsByUserId(user.id)
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
    async startCampaign(@Param('id') id: string, @CurrentUser() user: any) {
        const campaign = await this.supabase.getCampaignById(id, user.id)
        if (!campaign) {
            throw new HttpException('Campaign not found', HttpStatus.NOT_FOUND)
        }

        // Update campaign status
        await this.supabase.updateCampaign(id, user.id, { status: 'active' })

        // Create campaign run
        const run = await this.supabase.createCampaignRun({
            campaign_id: id,
            status: 'running',
        })

        // Create DB job for gather
        const dbJob = await this.supabase.createJob({
            run_id: run.id,
            queue: 'gather',
            type: 'gather-pool-info',
            payload: { campaignId: id, poolId: campaign.pool_id },
            status: 'queued',
        })

        // Enqueue initial gather job
        await this.gatherQueue.add('gather-pool-info', {
            runId: run.id,
            campaignId: id,
            poolId: campaign.pool_id,
            dbJobId: dbJob.id,
        })

        // Bootstrap initial buy/sell for user's active wallets
        const wallets = await this.supabase.getWalletsByUserId(user.id)

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

        // Get active run
        const runs = await this.supabase.getCampaignRunsByCampaignId(id)
        if (runs && runs.length > 0) {
            const activeRun = runs.find(r => r.status === 'running')
            if (activeRun) {
                await this.supabase.updateCampaignRun(activeRun.id, { status: 'paused' })

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

    @Post(':id/stop')
    async stopCampaign(@Param('id') id: string, @CurrentUser() user: any) {
        const campaign = await this.supabase.getCampaignById(id, user.id)
        if (!campaign) {
            throw new HttpException('Campaign not found', HttpStatus.NOT_FOUND)
        }

        // Update campaign status
        await this.supabase.updateCampaign(id, user.id, { status: 'stopped' })

        // Get active run
        const runs = await this.supabase.getCampaignRunsByCampaignId(id)
        if (runs && runs.length > 0) {
            const activeRun = runs.find(r => r.status === 'running' || r.status === 'paused')
            if (activeRun) {
                await this.supabase.updateCampaignRun(activeRun.id, {
                    status: 'stopped',
                    ended_at: new Date().toISOString(),
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
    async getCampaignRuns(@Param('id') id: string, @CurrentUser() user: any) {
        // Verify user owns the campaign
        const campaign = await this.supabase.getCampaignById(id, user.id)
        if (!campaign) {
            throw new HttpException('Campaign not found', HttpStatus.NOT_FOUND)
        }

        return await this.supabase.getCampaignRunsByCampaignId(id)
    }

    @Get(':id/logs')
    async getCampaignLogs(@Param('id') id: string, @CurrentUser() user: any, @Query('limit') limit: string = '100') {
        // Verify user owns the campaign
        const campaign = await this.supabase.getCampaignById(id, user.id)
        if (!campaign) {
            throw new HttpException('Campaign not found', HttpStatus.NOT_FOUND)
        }

        return await this.supabase.getCampaignLogs(id, parseInt(limit))
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
    async distribute(@Param('id') id: string, @CurrentUser() user: any) {
        const campaign = await this.supabase.getCampaignById(id, user.id)
        if (!campaign) {
            throw new HttpException('Campaign not found', HttpStatus.NOT_FOUND)
        }

        // Ensure there is a running run
        const run = await this.supabase.createCampaignRun({ campaign_id: id, status: 'running' })

        const dbJob = await this.supabase.createJob({
            run_id: run.id,
            queue: 'distribute',
            type: 'distribute-wallets',
            payload: { campaignId: id },
            status: 'queued',
        })

        await this.distributeQueue.add('distribute-wallets', {
            runId: run.id,
            campaignId: id,
            distributionNum: process.env.DISTRIBUTE_WALLET_NUM ? Number(process.env.DISTRIBUTE_WALLET_NUM) : 5,
            dbJobId: dbJob.id,
        })

        return { status: 'queued' }
    }

    @Post(':id/sell-only')
    async startSellOnly(@Param('id') id: string, @CurrentUser() user: any) {
        const campaign = await this.supabase.getCampaignById(id, user.id)
        if (!campaign) {
            throw new HttpException('Campaign not found', HttpStatus.NOT_FOUND)
        }

        await this.supabase.updateCampaign(id, user.id, { status: 'active' })
        const run = await this.supabase.createCampaignRun({ campaign_id: id, status: 'running' })

        // Fetch user's active wallets
        const wallets = await this.supabase.getWalletsByUserId(user.id)

        for (const w of wallets) {
            // Create DB job
            const dbJob = await this.supabase.createJob({
                run_id: run.id,
                queue: 'trade.sell',
                type: 'sell-token',
                payload: { campaignId: id, walletId: w.id, mode: 'sell-only' },
                status: 'queued',
            })

            // Enqueue sell job with mode=sell-only to prevent loop
            await this.tradeSellQueue.add('sell-token', {
                runId: run.id,
                campaignId: id,
                walletId: w.id,
                mode: 'sell-only',
                dbJobId: dbJob.id,
            })
        }

        return { status: 'queued', run }
    }

    @Post(':id/gather-funds')
    async gatherFunds(@Param('id') id: string, @CurrentUser() user: any) {
        const campaign = await this.supabase.getCampaignById(id, user.id)
        if (!campaign) {
            throw new HttpException('Campaign not found', HttpStatus.NOT_FOUND)
        }

        const run = await this.supabase.createCampaignRun({ campaign_id: id, status: 'running' })
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
}
