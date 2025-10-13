import { Controller, Get, Patch, Param, Query, Body, UseGuards, Req, HttpException, HttpStatus } from '@nestjs/common'
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery, ApiParam, ApiBody } from '@nestjs/swagger'
import { AdminGuard } from '../../../guards/admin.guard'
import { SupabaseService } from '../../../services/supabase.service'
import { Request } from 'express'

@ApiTags('Admin Users')
@ApiBearerAuth('JWT-auth')
@Controller('v1/admin/users')
@UseGuards(AdminGuard)
export class UsersController {
    constructor(private readonly supabaseService: SupabaseService) {}

    @Get()
    @ApiOperation({
        summary: 'List all users',
        description: 'Retrieve paginated list of all users with stats. Supports filtering by role, status, and search. Requires admin role.',
    })
    @ApiQuery({ name: 'role', required: false, enum: ['user', 'admin'], description: 'Filter by user role' })
    @ApiQuery({ name: 'status', required: false, enum: ['active', 'suspended'], description: 'Filter by user status' })
    @ApiQuery({ name: 'search', required: false, description: 'Search by email or ID' })
    @ApiQuery({ name: 'page', required: false, description: 'Page number (default: 1)' })
    @ApiQuery({ name: 'limit', required: false, description: 'Items per page (max: 100, default: 20)' })
    @ApiResponse({ status: 200, description: 'Users retrieved successfully' })
    @ApiResponse({ status: 400, description: 'Invalid pagination parameters' })
    @ApiResponse({ status: 401, description: 'Unauthorized - Invalid or missing JWT token' })
    @ApiResponse({ status: 403, description: 'Forbidden - Admin role required' })
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
    @ApiOperation({
        summary: 'Get user by ID',
        description: 'Retrieve detailed information about a specific user including campaigns, wallets, stats, and activity. Requires admin role.',
    })
    @ApiParam({ name: 'id', description: 'User ID' })
    @ApiResponse({ status: 200, description: 'User retrieved successfully' })
    @ApiResponse({ status: 404, description: 'User not found' })
    @ApiResponse({ status: 401, description: 'Unauthorized - Invalid or missing JWT token' })
    @ApiResponse({ status: 403, description: 'Forbidden - Admin role required' })
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
    @ApiOperation({
        summary: 'Update user role or status',
        description: 'Update user role (user/admin) or status (active/suspended). All changes are logged to audit trail. Requires admin role.',
    })
    @ApiParam({ name: 'id', description: 'User ID' })
    @ApiBody({
        schema: {
            type: 'object',
            required: ['reason'],
            properties: {
                role: { type: 'string', enum: ['user', 'admin'], description: 'New role (optional)' },
                status: { type: 'string', enum: ['active', 'suspended'], description: 'New status (optional)' },
                reason: { type: 'string', description: 'Reason for change (required for audit trail)' },
            },
        },
    })
    @ApiResponse({ status: 200, description: 'User updated successfully' })
    @ApiResponse({ status: 400, description: 'Missing reason or no changes provided' })
    @ApiResponse({ status: 404, description: 'User not found' })
    @ApiResponse({ status: 401, description: 'Unauthorized - Invalid or missing JWT token' })
    @ApiResponse({ status: 403, description: 'Forbidden - Admin role required' })
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
