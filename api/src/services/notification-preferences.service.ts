/**
 * Notification Preferences Service
 * Manages user notification preferences
 */

import { Injectable, NotFoundException } from '@nestjs/common'
import { SupabaseService } from './supabase.service'
import { UserNotificationPreferences, UpdateNotificationPreferencesDto } from '../types/notifications'

@Injectable()
export class NotificationPreferencesService {
    constructor(private readonly supabase: SupabaseService) {}

    /**
     * Get user notification preferences
     * Creates default preferences if none exist
     */
    async getPreferences(userId: string): Promise<UserNotificationPreferences> {
        const client = this.supabase.getClient()
        const { data, error } = await client
            .from('user_notification_preferences')
            .select('*')
            .eq('user_id', userId)
            .single()

        if (error) {
            if (error.code === 'PGRST116') {
                // No preferences found, create default
                return this.createDefaultPreferences(userId)
            }
            throw new Error(`Failed to fetch notification preferences: ${error.message}`)
        }

        return data as UserNotificationPreferences
    }

    /**
     * Update user notification preferences
     */
    async updatePreferences(userId: string, dto: UpdateNotificationPreferencesDto): Promise<UserNotificationPreferences> {
        const client = this.supabase.getClient()

        // Check if preferences exist
        const { data: existing } = await client
            .from('user_notification_preferences')
            .select('user_id')
            .eq('user_id', userId)
            .single()

        if (!existing) {
            // Create new preferences
            const { data, error } = await client
                .from('user_notification_preferences')
                .insert({
                    user_id: userId,
                    ...dto,
                })
                .select()
                .single()

            if (error) {
                throw new Error(`Failed to create notification preferences: ${error.message}`)
            }

            return data as UserNotificationPreferences
        }

        // Update existing preferences
        const { data, error } = await client
            .from('user_notification_preferences')
            .update(dto)
            .eq('user_id', userId)
            .select()
            .single()

        if (error) {
            throw new Error(`Failed to update notification preferences: ${error.message}`)
        }

        return data as UserNotificationPreferences
    }

    /**
     * Check if a user wants to receive a specific notification type
     */
    async shouldNotify(userId: string, eventType: string): Promise<boolean> {
        const preferences = await this.getPreferences(userId)

        // Check if email is globally enabled
        if (!preferences.email_enabled) {
            return false
        }

        // Map event type to preference field
        const eventTypeMap: Record<string, keyof UserNotificationPreferences> = {
            campaign_started: 'campaign_started',
            campaign_completed: 'campaign_completed',
            campaign_failed: 'campaign_failed',
            campaign_paused: 'campaign_paused',
            low_wallet_balance: 'low_wallet_balance',
            maintenance_scheduled: 'maintenance_alerts',
            maintenance_completed: 'maintenance_alerts',
            system_alert: 'system_alerts',
        }

        const preferenceKey = eventTypeMap[eventType]
        if (!preferenceKey) {
            return false
        }

        return Boolean(preferences[preferenceKey])
    }

    /**
     * Create default notification preferences for a user
     */
    private async createDefaultPreferences(userId: string): Promise<UserNotificationPreferences> {
        const client = this.supabase.getClient()
        const { data, error } = await client
            .from('user_notification_preferences')
            .insert({
                user_id: userId,
                email_enabled: true,
                campaign_started: true,
                campaign_completed: true,
                campaign_failed: true,
                campaign_paused: false,
                low_wallet_balance: true,
                maintenance_alerts: true,
                system_alerts: true,
            })
            .select()
            .single()

        if (error) {
            throw new Error(`Failed to create default notification preferences: ${error.message}`)
        }

        return data as UserNotificationPreferences
    }
}
