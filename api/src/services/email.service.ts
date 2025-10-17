/**
 * Email Service
 * Handles email delivery via Resend API
 */

import { Injectable } from '@nestjs/common'
import { Resend } from 'resend'
import { getEnvironmentConfig } from '../config/environment'
import { createLogger } from '../config/logger'
import { EmailProvider } from '../types/notifications'

const logger = createLogger({ name: 'email-service' })

export interface SendEmailOptions {
    to: string
    subject: string
    html: string
    text: string
}

export interface EmailSendResult {
    success: boolean
    messageId?: string
    error?: string
}

@Injectable()
export class EmailService {
    private resend: Resend | null = null
    private fromAddress: string
    private fromName: string
    private provider: EmailProvider = EmailProvider.RESEND

    constructor() {
        const config = getEnvironmentConfig()
        this.fromAddress = config.emailFromAddress || 'notifications@example.com'
        this.fromName = config.emailFromName || 'Solana Volume Bot'

        // Initialize Resend if API key is provided
        if (config.resendApiKey) {
            this.resend = new Resend(config.resendApiKey)
            logger.info('Email service initialized with Resend')
        } else {
            logger.warn('RESEND_API_KEY not configured. Email notifications will be logged but not sent.')
        }
    }

    /**
     * Send an email using the configured provider
     */
    async sendEmail(options: SendEmailOptions): Promise<EmailSendResult> {
        const { to, subject, html, text } = options

        // If no provider configured, log and return success (for development)
        if (!this.resend) {
            logger.warn({ to, subject }, 'Email not sent - no provider configured')
            return {
                success: true,
                messageId: 'mock-message-id',
            }
        }

        try {
            const result = await this.resend.emails.send({
                from: `${this.fromName} <${this.fromAddress}>`,
                to: [to],
                subject,
                html,
                text,
            })

            if (result.error) {
                logger.error({ error: result.error, to, subject }, 'Failed to send email via Resend')
                return {
                    success: false,
                    error: result.error.message || 'Unknown error',
                }
            }

            logger.info({ messageId: result.data?.id, to, subject }, 'Email sent successfully')
            return {
                success: true,
                messageId: result.data?.id,
            }
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error'
            logger.error({ error: errorMessage, to, subject }, 'Exception while sending email')
            return {
                success: false,
                error: errorMessage,
            }
        }
    }

    /**
     * Send multiple emails in batch
     */
    async sendBatchEmails(emails: SendEmailOptions[]): Promise<EmailSendResult[]> {
        const results = await Promise.allSettled(emails.map((email) => this.sendEmail(email)))

        return results.map((result) => {
            if (result.status === 'fulfilled') {
                return result.value
            }
            return {
                success: false,
                error: result.reason instanceof Error ? result.reason.message : 'Unknown error',
            }
        })
    }

    /**
     * Verify email configuration
     */
    async verifyConfiguration(): Promise<boolean> {
        if (!this.resend) {
            return false
        }

        try {
            // Try to fetch API key status (Resend doesn't have a dedicated verify endpoint)
            // We'll just check if the client is initialized properly
            return true
        } catch (error) {
            logger.error({ error }, 'Email configuration verification failed')
            return false
        }
    }

    /**
     * Get the current email provider
     */
    getProvider(): EmailProvider {
        return this.provider
    }

    /**
     * Check if email service is configured
     */
    isConfigured(): boolean {
        return this.resend !== null
    }
}
