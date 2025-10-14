/**
 * Notifications Controller
 * API endpoints for managing notification preferences and viewing logs
 */

import { Controller, Get, Put, Body, Req, UseGuards, Query, BadRequestException } from '@nestjs/common'
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger'
import { NotificationService } from '../services/notification.service'
import { NotificationPreferencesService } from '../services/notification-preferences.service'
import { NotificationTemplateService } from '../services/notification-template.service'
import {
    UpdateNotificationPreferencesDto,
    UserNotificationPreferencesResponseDto,
    NotificationLogResponseDto,
    NotificationTemplateResponseDto,
} from '../types/notifications'
import { createLogger } from '../config/logger'

const logger = createLogger({ name: 'notifications-controller' })

interface AuthenticatedRequest extends Request {
    user: {
        id: string
        email: string
    }
}

@ApiTags('Notifications')
@ApiBearerAuth()
@Controller('v1/notifications')
export class NotificationsController {
    constructor(
        private readonly notificationService: NotificationService,
        private readonly preferencesService: NotificationPreferencesService,
        private readonly templateService: NotificationTemplateService,
    ) {}

    /**
     * Get user notification preferences
     */
    @Get('preferences')
    @ApiOperation({ summary: 'Get user notification preferences' })
    @ApiResponse({ status: 200, type: UserNotificationPreferencesResponseDto })
    async getPreferences(@Req() req: AuthenticatedRequest): Promise<UserNotificationPreferencesResponseDto> {
        const userId = req.user.id
        logger.info({ userId }, 'Getting notification preferences')
        return this.preferencesService.getPreferences(userId)
    }

    /**
     * Update user notification preferences
     */
    @Put('preferences')
    @ApiOperation({ summary: 'Update user notification preferences' })
    @ApiResponse({ status: 200, type: UserNotificationPreferencesResponseDto })
    async updatePreferences(
        @Req() req: AuthenticatedRequest,
        @Body() dto: UpdateNotificationPreferencesDto,
    ): Promise<UserNotificationPreferencesResponseDto> {
        const userId = req.user.id
        logger.info({ userId, preferences: dto }, 'Updating notification preferences')
        return this.preferencesService.updatePreferences(userId, dto)
    }

    /**
     * Get user notification logs
     */
    @Get('logs')
    @ApiOperation({ summary: 'Get notification history for the current user' })
    @ApiResponse({ status: 200, type: [NotificationLogResponseDto] })
    async getLogs(
        @Req() req: AuthenticatedRequest,
        @Query('limit') limit?: string,
    ): Promise<NotificationLogResponseDto[]> {
        const userId = req.user.id
        const limitNum = limit ? parseInt(limit, 10) : 50

        if (isNaN(limitNum) || limitNum < 1 || limitNum > 100) {
            throw new BadRequestException('Limit must be between 1 and 100')
        }

        logger.info({ userId, limit: limitNum }, 'Getting notification logs')
        return this.notificationService.getNotificationLogs(userId, limitNum)
    }

    /**
     * Get all notification templates (public)
     */
    @Get('templates')
    @ApiOperation({ summary: 'Get all notification templates' })
    @ApiResponse({ status: 200, type: [NotificationTemplateResponseDto] })
    async getTemplates(@Query('active') active?: string): Promise<NotificationTemplateResponseDto[]> {
        const activeOnly = active === 'true'
        logger.info({ activeOnly }, 'Getting notification templates')
        return this.templateService.findAll(activeOnly)
    }
}
