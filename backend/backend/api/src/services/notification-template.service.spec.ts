/**
 * NotificationTemplateService Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NotificationTemplateService } from './notification-template.service'
import { SupabaseService } from './supabase.service'
import { NotificationEventType } from '../types/notifications'
import { NotFoundException, BadRequestException } from '@nestjs/common'

// Mock SupabaseService
const mockSupabaseService = {
    getClient: vi.fn(),
}

describe('NotificationTemplateService', () => {
    let service: NotificationTemplateService
    let mockClient: any

    beforeEach(() => {
        // Create a properly chained mock client
        const createChainableMock = () => {
            const mock: any = {
                from: vi.fn().mockReturnThis(),
                select: vi.fn().mockReturnThis(),
                insert: vi.fn().mockReturnThis(),
                update: vi.fn().mockReturnThis(),
                delete: vi.fn().mockReturnThis(),
                eq: vi.fn().mockReturnThis(),
                order: vi.fn().mockReturnThis(),
                single: vi.fn().mockReturnThis(),
            }
            // Make each method return the mock itself
            Object.keys(mock).forEach(key => {
                mock[key].mockReturnValue(mock)
            })
            return mock
        }

        mockClient = createChainableMock()
        mockSupabaseService.getClient.mockReturnValue(mockClient)
        service = new NotificationTemplateService(mockSupabaseService as any)
    })

    describe('findAll', () => {
        it('should return all templates', async () => {
            const mockTemplates = [
                {
                    id: '1',
                    event_type: NotificationEventType.CAMPAIGN_STARTED,
                    name: 'Campaign Started',
                    subject: 'Campaign Started',
                    html_body: '<p>Campaign started</p>',
                    text_body: 'Campaign started',
                    variables: [],
                    is_active: true,
                },
            ]

            mockClient.order.mockResolvedValueOnce({ data: mockTemplates, error: null })

            const result = await service.findAll()
            expect(result).toEqual(mockTemplates)
            expect(mockClient.from).toHaveBeenCalledWith('notification_templates')
        })

        it('should filter active templates when requested', async () => {
            // The final resolution happens on the eq call when activeOnly is true
            mockClient.eq.mockResolvedValueOnce({ data: [], error: null })

            await service.findAll(true)
            expect(mockClient.eq).toHaveBeenCalledWith('is_active', true)
        })

        it('should throw error on database failure', async () => {
            mockClient.order.mockResolvedValueOnce({ data: null, error: { message: 'DB error' } })

            await expect(service.findAll()).rejects.toThrow('Failed to fetch notification templates')
        })
    })

    describe('findById', () => {
        it('should return template by ID', async () => {
            const mockTemplate = {
                id: '1',
                event_type: NotificationEventType.CAMPAIGN_STARTED,
                name: 'Campaign Started',
            }

            mockClient.single.mockResolvedValue({ data: mockTemplate, error: null })

            const result = await service.findById('1')
            expect(result).toEqual(mockTemplate)
            expect(mockClient.eq).toHaveBeenCalledWith('id', '1')
        })

        it('should throw NotFoundException when template not found', async () => {
            mockClient.single.mockResolvedValue({ data: null, error: { message: 'Not found' } })

            await expect(service.findById('999')).rejects.toThrow(NotFoundException)
        })
    })

    describe('findByEventType', () => {
        it('should return active template for event type', async () => {
            const mockTemplate = {
                id: '1',
                event_type: NotificationEventType.CAMPAIGN_STARTED,
                name: 'Campaign Started',
            }

            mockClient.single.mockResolvedValue({ data: mockTemplate, error: null })

            const result = await service.findByEventType(NotificationEventType.CAMPAIGN_STARTED)
            expect(result).toEqual(mockTemplate)
            expect(mockClient.eq).toHaveBeenCalledWith('event_type', NotificationEventType.CAMPAIGN_STARTED)
            expect(mockClient.eq).toHaveBeenCalledWith('is_active', true)
        })
    })

    describe('create', () => {
        it('should create a new template', async () => {
            const dto = {
                event_type: NotificationEventType.CAMPAIGN_STARTED,
                name: 'Test Template',
                subject: 'Test {{name}}',
                html_body: '<p>Hello {{name}}</p>',
                text_body: 'Hello {{name}}',
                variables: ['name'],
                is_active: true,
            }

            mockClient.single.mockResolvedValue({ data: { id: '1', ...dto }, error: null })

            const result = await service.create(dto)
            expect(result).toHaveProperty('id')
            expect(mockClient.insert).toHaveBeenCalled()
        })

        it('should throw BadRequestException for undefined variables', async () => {
            const dto = {
                event_type: NotificationEventType.CAMPAIGN_STARTED,
                name: 'Test Template',
                subject: 'Test {{undefinedVar}}',
                html_body: '<p>Hello</p>',
                text_body: 'Hello',
                variables: [],
                is_active: true,
            }

            await expect(service.create(dto)).rejects.toThrow(BadRequestException)
        })
    })

    describe('renderTemplate', () => {
        it('should replace variables in template', () => {
            const template = 'Hello {{name}}, your balance is {{balance}}'
            const variables = { name: 'John', balance: '100' }

            const result = service.renderTemplate(template, variables)
            expect(result).toBe('Hello John, your balance is 100')
        })

        it('should handle missing variables gracefully', () => {
            const template = 'Hello {{name}}'
            const variables = { name: undefined }

            const result = service.renderTemplate(template, variables)
            expect(result).toBe('Hello ')
        })

        it('should handle multiple occurrences of same variable', () => {
            const template = '{{name}} is {{name}}'
            const variables = { name: 'Alice' }

            const result = service.renderTemplate(template, variables)
            expect(result).toBe('Alice is Alice')
        })
    })

    describe('update', () => {
        it('should update template', async () => {
            const existingTemplate = {
                id: '1',
                subject: 'Old Subject',
                html_body: '<p>Old</p>',
                text_body: 'Old',
                variables: [],
            }

            const updateDto = {
                subject: 'New Subject',
            }

            mockClient.single
                .mockResolvedValueOnce({ data: existingTemplate, error: null })
                .mockResolvedValueOnce({ data: { ...existingTemplate, ...updateDto }, error: null })

            const result = await service.update('1', updateDto)
            expect(result.subject).toBe('New Subject')
        })
    })

    describe('delete', () => {
        it('should delete template', async () => {
            mockClient.eq.mockResolvedValueOnce({ error: null })

            await expect(service.delete('1')).resolves.not.toThrow()
            expect(mockClient.delete).toHaveBeenCalled()
        })

        it('should throw error on database failure', async () => {
            mockClient.eq.mockResolvedValueOnce({ error: { message: 'Cannot delete' } })

            await expect(service.delete('1')).rejects.toThrow('Failed to delete notification template')
        })
    })
})
