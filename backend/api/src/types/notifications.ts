/**
 * Notification System Types and DTOs
 */

import { ApiProperty } from '@nestjs/swagger'

/**
 * Event types that can trigger notifications
 */
export enum NotificationEventType {
    CAMPAIGN_STARTED = 'campaign_started',
    CAMPAIGN_COMPLETED = 'campaign_completed',
    CAMPAIGN_FAILED = 'campaign_failed',
    CAMPAIGN_PAUSED = 'campaign_paused',
    LOW_WALLET_BALANCE = 'low_wallet_balance',
    MAINTENANCE_SCHEDULED = 'maintenance_scheduled',
    MAINTENANCE_COMPLETED = 'maintenance_completed',
    SYSTEM_ALERT = 'system_alert',
}

/**
 * Notification delivery status
 */
export enum NotificationStatus {
    PENDING = 'pending',
    SENT = 'sent',
    FAILED = 'failed',
    BOUNCED = 'bounced',
}

/**
 * Email service providers
 */
export enum EmailProvider {
    RESEND = 'resend',
    SENDGRID = 'sendgrid',
    SUPABASE = 'supabase',
}

/**
 * Notification template entity
 */
export interface NotificationTemplate {
    id: string
    event_type: NotificationEventType
    name: string
    description?: string
    subject: string
    html_body: string
    text_body: string
    variables: string[]
    is_active: boolean
    created_at: string
    updated_at: string
}

/**
 * Notification log entity
 */
export interface NotificationLog {
    id: string
    user_id: string
    template_id?: string
    event_type: NotificationEventType
    recipient_email: string
    subject: string
    status: NotificationStatus
    provider: EmailProvider
    provider_message_id?: string
    error_message?: string
    metadata?: Record<string, any>
    sent_at?: string
    created_at: string
    updated_at: string
}

/**
 * User notification preferences entity
 */
export interface UserNotificationPreferences {
    user_id: string
    email_enabled: boolean
    campaign_started: boolean
    campaign_completed: boolean
    campaign_failed: boolean
    campaign_paused: boolean
    low_wallet_balance: boolean
    maintenance_alerts: boolean
    system_alerts: boolean
    created_at: string
    updated_at: string
}

/**
 * DTO for creating/updating notification templates
 */
export class CreateNotificationTemplateDto {
    @ApiProperty({ enum: NotificationEventType })
    event_type: NotificationEventType

    @ApiProperty()
    name: string

    @ApiProperty({ required: false })
    description?: string

    @ApiProperty()
    subject: string

    @ApiProperty()
    html_body: string

    @ApiProperty()
    text_body: string

    @ApiProperty({ type: [String] })
    variables: string[]

    @ApiProperty({ default: true })
    is_active: boolean = true
}

/**
 * DTO for updating notification template
 */
export class UpdateNotificationTemplateDto {
    @ApiProperty({ required: false })
    name?: string

    @ApiProperty({ required: false })
    description?: string

    @ApiProperty({ required: false })
    subject?: string

    @ApiProperty({ required: false })
    html_body?: string

    @ApiProperty({ required: false })
    text_body?: string

    @ApiProperty({ type: [String], required: false })
    variables?: string[]

    @ApiProperty({ required: false })
    is_active?: boolean
}

/**
 * DTO for updating user notification preferences
 */
export class UpdateNotificationPreferencesDto {
    @ApiProperty({ required: false })
    email_enabled?: boolean

    @ApiProperty({ required: false })
    campaign_started?: boolean

    @ApiProperty({ required: false })
    campaign_completed?: boolean

    @ApiProperty({ required: false })
    campaign_failed?: boolean

    @ApiProperty({ required: false })
    campaign_paused?: boolean

    @ApiProperty({ required: false })
    low_wallet_balance?: boolean

    @ApiProperty({ required: false })
    maintenance_alerts?: boolean

    @ApiProperty({ required: false })
    system_alerts?: boolean
}

/**
 * DTO for sending a notification
 */
export interface SendNotificationDto {
    eventType: NotificationEventType
    userId: string
    recipientEmail: string
    variables: Record<string, any>
    metadata?: Record<string, any>
}

/**
 * Response DTO for notification templates
 */
export class NotificationTemplateResponseDto {
    @ApiProperty()
    id: string

    @ApiProperty({ enum: NotificationEventType })
    event_type: NotificationEventType

    @ApiProperty()
    name: string

    @ApiProperty({ required: false })
    description?: string

    @ApiProperty()
    subject: string

    @ApiProperty()
    html_body: string

    @ApiProperty()
    text_body: string

    @ApiProperty({ type: [String] })
    variables: string[]

    @ApiProperty()
    is_active: boolean

    @ApiProperty()
    created_at: string

    @ApiProperty()
    updated_at: string
}

/**
 * Response DTO for notification logs
 */
export class NotificationLogResponseDto {
    @ApiProperty()
    id: string

    @ApiProperty()
    user_id: string

    @ApiProperty({ required: false })
    template_id?: string

    @ApiProperty({ enum: NotificationEventType })
    event_type: NotificationEventType

    @ApiProperty()
    recipient_email: string

    @ApiProperty()
    subject: string

    @ApiProperty({ enum: NotificationStatus })
    status: NotificationStatus

    @ApiProperty({ enum: EmailProvider })
    provider: EmailProvider

    @ApiProperty({ required: false })
    provider_message_id?: string

    @ApiProperty({ required: false })
    error_message?: string

    @ApiProperty({ required: false })
    metadata?: Record<string, any>

    @ApiProperty({ required: false })
    sent_at?: string

    @ApiProperty()
    created_at: string

    @ApiProperty()
    updated_at: string
}

/**
 * Response DTO for user notification preferences
 */
export class UserNotificationPreferencesResponseDto {
    @ApiProperty()
    user_id: string

    @ApiProperty()
    email_enabled: boolean

    @ApiProperty()
    campaign_started: boolean

    @ApiProperty()
    campaign_completed: boolean

    @ApiProperty()
    campaign_failed: boolean

    @ApiProperty()
    campaign_paused: boolean

    @ApiProperty()
    low_wallet_balance: boolean

    @ApiProperty()
    maintenance_alerts: boolean

    @ApiProperty()
    system_alerts: boolean

    @ApiProperty()
    created_at: string

    @ApiProperty()
    updated_at: string
}
