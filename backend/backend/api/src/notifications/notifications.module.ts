/**
 * Notifications Module
 * Provides notification services and controllers
 */

import { Module } from '@nestjs/common'
import { NotificationService } from '../services/notification.service'
import { EmailService } from '../services/email.service'
import { NotificationTemplateService } from '../services/notification-template.service'
import { NotificationPreferencesService } from '../services/notification-preferences.service'
import { SupabaseService } from '../services/supabase.service'
import { NotificationsController } from './notifications.controller'

@Module({
    controllers: [NotificationsController],
    providers: [
        SupabaseService,
        EmailService,
        NotificationTemplateService,
        NotificationPreferencesService,
        NotificationService,
    ],
    exports: [NotificationService],
})
export class NotificationsModule {}
