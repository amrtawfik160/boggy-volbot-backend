/**
 * EmailService Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { EmailService } from './email.service'

// Mock Resend
vi.mock('resend', () => {
    return {
        Resend: vi.fn().mockImplementation(() => ({
            emails: {
                send: vi.fn(),
            },
        })),
    }
})

// Mock environment config
vi.mock('../config/environment', () => ({
    getEnvironmentConfig: vi.fn(() => ({
        resendApiKey: 'test-api-key',
        emailFromAddress: 'test@example.com',
        emailFromName: 'Test Bot',
    })),
}))

// Mock logger
vi.mock('../config/logger', () => ({
    createLogger: vi.fn(() => ({
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
    })),
}))

describe('EmailService', () => {
    let service: EmailService
    let mockResendSend: any

    beforeEach(() => {
        service = new EmailService()
        mockResendSend = (service as any).resend?.emails.send
    })

    describe('sendEmail', () => {
        it('should send email successfully', async () => {
            const mockMessageId = 'msg-123'
            mockResendSend.mockResolvedValue({
                data: { id: mockMessageId },
                error: null,
            })

            const result = await service.sendEmail({
                to: 'recipient@example.com',
                subject: 'Test Subject',
                html: '<p>Test HTML</p>',
                text: 'Test Text',
            })

            expect(result.success).toBe(true)
            expect(result.messageId).toBe(mockMessageId)
            expect(mockResendSend).toHaveBeenCalledWith({
                from: 'Test Bot <test@example.com>',
                to: ['recipient@example.com'],
                subject: 'Test Subject',
                html: '<p>Test HTML</p>',
                text: 'Test Text',
            })
        })

        it('should handle Resend API errors', async () => {
            mockResendSend.mockResolvedValue({
                data: null,
                error: { message: 'API Error' },
            })

            const result = await service.sendEmail({
                to: 'recipient@example.com',
                subject: 'Test Subject',
                html: '<p>Test</p>',
                text: 'Test',
            })

            expect(result.success).toBe(false)
            expect(result.error).toBe('API Error')
        })

        it('should handle exceptions during send', async () => {
            mockResendSend.mockRejectedValue(new Error('Network error'))

            const result = await service.sendEmail({
                to: 'recipient@example.com',
                subject: 'Test Subject',
                html: '<p>Test</p>',
                text: 'Test',
            })

            expect(result.success).toBe(false)
            expect(result.error).toBe('Network error')
        })
    })

    describe('sendBatchEmails', () => {
        it('should send multiple emails', async () => {
            mockResendSend.mockResolvedValue({
                data: { id: 'msg-123' },
                error: null,
            })

            const emails = [
                {
                    to: 'user1@example.com',
                    subject: 'Test 1',
                    html: '<p>Test 1</p>',
                    text: 'Test 1',
                },
                {
                    to: 'user2@example.com',
                    subject: 'Test 2',
                    html: '<p>Test 2</p>',
                    text: 'Test 2',
                },
            ]

            const results = await service.sendBatchEmails(emails)

            expect(results).toHaveLength(2)
            expect(results[0].success).toBe(true)
            expect(results[1].success).toBe(true)
        })

        it('should handle partial failures in batch', async () => {
            mockResendSend
                .mockResolvedValueOnce({
                    data: { id: 'msg-123' },
                    error: null,
                })
                .mockResolvedValueOnce({
                    data: null,
                    error: { message: 'API Error' },
                })

            const emails = [
                {
                    to: 'user1@example.com',
                    subject: 'Test 1',
                    html: '<p>Test 1</p>',
                    text: 'Test 1',
                },
                {
                    to: 'user2@example.com',
                    subject: 'Test 2',
                    html: '<p>Test 2</p>',
                    text: 'Test 2',
                },
            ]

            const results = await service.sendBatchEmails(emails)

            expect(results[0].success).toBe(true)
            expect(results[1].success).toBe(false)
        })
    })

    describe('isConfigured', () => {
        it('should return true when Resend is configured', () => {
            expect(service.isConfigured()).toBe(true)
        })
    })

    describe('getProvider', () => {
        it('should return the provider name', () => {
            const provider = service.getProvider()
            expect(provider).toBe('resend')
        })
    })
})
