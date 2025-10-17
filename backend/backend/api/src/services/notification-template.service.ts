/**
 * Notification Template Service
 * Handles CRUD operations for notification templates
 */

import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common'
import { SupabaseService } from './supabase.service'
import {
    NotificationTemplate,
    NotificationEventType,
    CreateNotificationTemplateDto,
    UpdateNotificationTemplateDto,
} from '../types/notifications'

@Injectable()
export class NotificationTemplateService {
    constructor(private readonly supabase: SupabaseService) {}

    /**
     * Get all notification templates
     */
    async findAll(activeOnly = false): Promise<NotificationTemplate[]> {
        const client = this.supabase.getClient()
        let query = client.from('notification_templates').select('*').order('event_type', { ascending: true })

        if (activeOnly) {
            query = query.eq('is_active', true)
        }

        const { data, error } = await query

        if (error) {
            throw new Error(`Failed to fetch notification templates: ${error.message}`)
        }

        return data as NotificationTemplate[]
    }

    /**
     * Get a single notification template by ID
     */
    async findById(id: string): Promise<NotificationTemplate> {
        const client = this.supabase.getClient()
        const { data, error } = await client.from('notification_templates').select('*').eq('id', id).single()

        if (error || !data) {
            throw new NotFoundException(`Notification template with ID ${id} not found`)
        }

        return data as NotificationTemplate
    }

    /**
     * Get a notification template by event type
     */
    async findByEventType(eventType: NotificationEventType): Promise<NotificationTemplate> {
        const client = this.supabase.getClient()
        const { data, error } = await client
            .from('notification_templates')
            .select('*')
            .eq('event_type', eventType)
            .eq('is_active', true)
            .single()

        if (error || !data) {
            throw new NotFoundException(`Active notification template for event type ${eventType} not found`)
        }

        return data as NotificationTemplate
    }

    /**
     * Create a new notification template
     */
    async create(dto: CreateNotificationTemplateDto): Promise<NotificationTemplate> {
        // Validate that variables in subject and body match the variables array
        this.validateTemplateVariables(dto.subject, dto.html_body, dto.text_body, dto.variables)

        const client = this.supabase.getClient()
        const { data, error } = await client
            .from('notification_templates')
            .insert({
                event_type: dto.event_type,
                name: dto.name,
                description: dto.description,
                subject: dto.subject,
                html_body: dto.html_body,
                text_body: dto.text_body,
                variables: dto.variables,
                is_active: dto.is_active,
            })
            .select()
            .single()

        if (error) {
            throw new Error(`Failed to create notification template: ${error.message}`)
        }

        return data as NotificationTemplate
    }

    /**
     * Update an existing notification template
     */
    async update(id: string, dto: UpdateNotificationTemplateDto): Promise<NotificationTemplate> {
        // Fetch the existing template first
        const existing = await this.findById(id)

        // Prepare updated values
        const subject = dto.subject ?? existing.subject
        const htmlBody = dto.html_body ?? existing.html_body
        const textBody = dto.text_body ?? existing.text_body
        const variables = dto.variables ?? existing.variables

        // Validate variables if any content was updated
        if (dto.subject || dto.html_body || dto.text_body || dto.variables) {
            this.validateTemplateVariables(subject, htmlBody, textBody, variables)
        }

        const client = this.supabase.getClient()
        const { data, error } = await client
            .from('notification_templates')
            .update({
                name: dto.name,
                description: dto.description,
                subject: dto.subject,
                html_body: dto.html_body,
                text_body: dto.text_body,
                variables: dto.variables,
                is_active: dto.is_active,
            })
            .eq('id', id)
            .select()
            .single()

        if (error) {
            throw new Error(`Failed to update notification template: ${error.message}`)
        }

        return data as NotificationTemplate
    }

    /**
     * Delete a notification template
     */
    async delete(id: string): Promise<void> {
        const client = this.supabase.getClient()
        const { error } = await client.from('notification_templates').delete().eq('id', id)

        if (error) {
            throw new Error(`Failed to delete notification template: ${error.message}`)
        }
    }

    /**
     * Render a template with variables
     */
    renderTemplate(template: string, variables: Record<string, any>): string {
        let rendered = template

        // Replace all {{variable}} occurrences
        for (const [key, value] of Object.entries(variables)) {
            const regex = new RegExp(`{{${key}}}`, 'g')
            rendered = rendered.replace(regex, String(value ?? ''))
        }

        return rendered
    }

    /**
     * Validate that all variables in the template are defined
     */
    private validateTemplateVariables(subject: string, htmlBody: string, textBody: string, variables: string[]): void {
        const allContent = `${subject} ${htmlBody} ${textBody}`
        const variableRegex = /{{(\w+)}}/g
        const usedVariables = new Set<string>()

        let match: RegExpExecArray | null
        while ((match = variableRegex.exec(allContent)) !== null) {
            usedVariables.add(match[1])
        }

        // Check if all used variables are defined
        const undefinedVariables = Array.from(usedVariables).filter((v) => !variables.includes(v))
        if (undefinedVariables.length > 0) {
            throw new BadRequestException(
                `Template uses undefined variables: ${undefinedVariables.join(', ')}. Please add them to the variables array.`,
            )
        }

        // Check if all defined variables are used (warning, not error)
        const unusedVariables = variables.filter((v) => !usedVariables.has(v))
        if (unusedVariables.length > 0) {
            console.warn(`Template defines unused variables: ${unusedVariables.join(', ')}`)
        }
    }
}
