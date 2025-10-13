import { Controller, Get, Patch, Param, Query, Body, UseGuards, Req, HttpException, HttpStatus } from '@nestjs/common'
import { AdminGuard } from '../../../guards/admin.guard'
import { SupabaseService } from '../../../services/supabase.service'
import { Request } from 'express'

@Controller('v1/admin/users')
@UseGuards(AdminGuard)
export class UsersController {
    constructor(private readonly supabaseService: SupabaseService) {}

    @Get()
    async getUsers(
        @Query('role') role?: string,
        @Query('status') status?: string,
        @Query('search') search?: string,
        @Query('page') page: string = '1',
        @Query('limit') limit: string = '20'
    ) {
        const pageNum = parseInt(page, 10)
        const limitNum = Math.min(parseInt(limit, 10), 100) // Max 100 items per page

        if (pageNum < 1 || limitNum < 1) {
            throw new HttpException('Invalid pagination parameters', HttpStatus.BAD_REQUEST)
        }

        const result = await this.supabaseService.getAdminUsers({
            role,
            status,
            search,
            page: pageNum,
            limit: limitNum,
        })

        // Calculate stats for each user
        const dataWithStats = await Promise.all(
            result.data.map(async user => {
                // Get campaign counts
                const campaigns = await this.supabaseService.getAdminUserCampaigns(user.id)
                const activeCampaigns = campaigns.filter(c => c.status === 'active').length

                // Get wallet count
                const wallets = await this.supabaseService.getAdminUserWallets(user.id)

                // Get 24h stats (simplified - can be enhanced)
                const oneDayAgo = new Date()
                oneDayAgo.setDate(oneDayAgo.getDate() - 1)

                return {
                    id: user.id,
                    email: user.email,
                    role: user.role,
                    status: user.status || 'active',
                    created_at: user.created_at,
                    updated_at: user.updated_at,
                    last_sign_in_at: user.last_sign_in_at,
                    stats: {
                        totalCampaigns: campaigns.length,
                        activeCampaigns,
                        totalWallets: wallets.length,
                        totalVolume24h: 0, // TODO: Implement volume tracking
                        totalTransactions24h: 0, // TODO: Implement transaction tracking
                    },
                }
            })
        )

        const totalPages = Math.ceil(result.total / limitNum)

        return {
            data: dataWithStats,
            pagination: {
                page: pageNum,
                limit: limitNum,
                total: result.total,
                totalPages,
            },
        }
    }

    @Get(':id')
    async getUserById(@Param('id') id: string) {
        const user = await this.supabaseService.getAdminUserById(id)

        if (!user) {
            throw new HttpException('User not found', HttpStatus.NOT_FOUND)
        }

        const campaigns = await this.supabaseService.getAdminUserCampaigns(id)
        const wallets = await this.supabaseService.getAdminUserWallets(id)
        const stats = await this.supabaseService.getAdminUserStats(id)
        const activity = await this.supabaseService.getAdminUserActivity(id, 50)

        return {
            id: user.id,
            email: user.email,
            role: user.role,
            status: user.status || 'active',
            created_at: user.created_at,
            updated_at: user.updated_at,
            last_sign_in_at: user.last_sign_in_at,
            campaigns,
            wallets,
            stats,
            activity,
        }
    }

    @Patch(':id')
    async updateUser(
        @Param('id') id: string,
        @Body() body: { role?: 'user' | 'admin'; status?: 'active' | 'suspended'; reason: string },
        @Req() request: Request
    ) {
        if (!body.reason) {
            throw new HttpException('Reason is required for audit trail', HttpStatus.BAD_REQUEST)
        }

        if (!body.role && !body.status) {
            throw new HttpException('At least one of role or status must be provided', HttpStatus.BAD_REQUEST)
        }

        const user = await this.supabaseService.getAdminUserById(id)
        if (!user) {
            throw new HttpException('User not found', HttpStatus.NOT_FOUND)
        }

        // Update user
        const updates: { role?: string; status?: string } = {}
        if (body.role) updates.role = body.role
        if (body.status) updates.status = body.status

        const updatedUser = await this.supabaseService.updateUserRoleAndStatus(id, updates)

        // Create audit log
        const adminUser = (request as any).user
        const auditLog = await this.supabaseService.createAuditLog({
            admin_id: adminUser?.id,
            user_id: id,
            action: 'user_update',
            entity: 'user',
            entity_id: id,
            metadata: {
                changes: updates,
                reason: body.reason,
                oldRole: user.role,
                oldStatus: user.status,
            },
            ip_address: request.ip,
            user_agent: request.headers['user-agent'],
        })

        return {
            success: true,
            user: {
                id: updatedUser.id,
                email: updatedUser.email,
                role: updatedUser.role,
                status: updatedUser.status,
                updated_at: updatedUser.updated_at,
            },
            audit: {
                id: auditLog.id,
                action: auditLog.action,
                reason: body.reason,
                timestamp: auditLog.created_at,
            },
        }
    }
}
