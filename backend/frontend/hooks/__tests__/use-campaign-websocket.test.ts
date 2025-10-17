import { renderHook, waitFor, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { useCampaignWebSocket } from '../use-campaign-websocket'
import type { Socket } from 'socket.io-client'

// Mock socket.io-client
const mockSocket: Partial<Socket> = {
  id: 'test-socket-id',
  connected: false,
  on: vi.fn(),
  emit: vi.fn(),
  disconnect: vi.fn(),
}

const mockIo = vi.fn(() => mockSocket as Socket)

vi.mock('socket.io-client', () => ({
  io: mockIo,
}))

// Mock Supabase client
const mockGetSession = vi.fn()
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: {
      getSession: mockGetSession,
    },
  }),
}))

describe('useCampaignWebSocket', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSocket.connected = false

    // Mock successful auth session
    mockGetSession.mockResolvedValue({
      data: {
        session: {
          access_token: 'test-token',
        },
      },
    })
  })

  afterEach(() => {
    vi.clearAllTimers()
  })

  describe('Connection Management', () => {
    it('should initialize WebSocket connection on mount', async () => {
      const { result } = renderHook(() => useCampaignWebSocket())

      await waitFor(() => {
        expect(mockIo).toHaveBeenCalledWith(
          expect.stringContaining('/campaigns'),
          expect.objectContaining({
            auth: { token: 'test-token' },
            transports: ['websocket', 'polling'],
            reconnection: true,
          })
        )
      })
    })

    it('should set isConnected to true when socket connects', async () => {
      const { result } = renderHook(() => useCampaignWebSocket())

      await waitFor(() => {
        expect(mockSocket.on).toHaveBeenCalledWith('connect', expect.any(Function))
      })

      // Simulate connect event
      const connectHandler = (mockSocket.on as any).mock.calls.find(
        (call: any[]) => call[0] === 'connect'
      )?.[1]

      act(() => {
        mockSocket.connected = true
        connectHandler?.()
      })

      await waitFor(() => {
        expect(result.current.isConnected).toBe(true)
        expect(result.current.isAuthenticated).toBe(true)
      })
    })

    it('should handle connection errors gracefully', async () => {
      const onError = vi.fn()
      const { result } = renderHook(() => useCampaignWebSocket({ onError }))

      await waitFor(() => {
        expect(mockSocket.on).toHaveBeenCalledWith('connect_error', expect.any(Function))
      })

      // Simulate connection error
      const errorHandler = (mockSocket.on as any).mock.calls.find(
        (call: any[]) => call[0] === 'connect_error'
      )?.[1]

      act(() => {
        errorHandler?.(new Error('Connection failed'))
      })

      await waitFor(() => {
        expect(result.current.isConnected).toBe(false)
        expect(result.current.error).toBeTruthy()
        expect(onError).toHaveBeenCalled()
      })
    })

    it('should disconnect socket on unmount', async () => {
      const { unmount } = renderHook(() => useCampaignWebSocket())

      await waitFor(() => {
        expect(mockSocket.on).toHaveBeenCalled()
      })

      unmount()

      expect(mockSocket.disconnect).toHaveBeenCalled()
    })
  })

  describe('Campaign Subscription', () => {
    it('should join campaign room successfully', async () => {
      const { result } = renderHook(() => useCampaignWebSocket())

      // Set socket as connected
      act(() => {
        mockSocket.connected = true
      })

      // Mock emit to call callback with success
      ;(mockSocket.emit as any).mockImplementation(
        (event: string, data: any, callback: Function) => {
          if (event === 'join_campaign') {
            callback({ success: true, campaignId: 'campaign-123' })
          }
        }
      )

      await act(async () => {
        await result.current.joinCampaign('campaign-123')
      })

      expect(mockSocket.emit).toHaveBeenCalledWith(
        'join_campaign',
        { campaignId: 'campaign-123' },
        expect.any(Function)
      )
      expect(result.current.subscribedCampaigns).toContain('campaign-123')
    })

    it('should leave campaign room successfully', async () => {
      const { result } = renderHook(() => useCampaignWebSocket())

      act(() => {
        mockSocket.connected = true
      })

      // Join first
      ;(mockSocket.emit as any).mockImplementation(
        (event: string, data: any, callback: Function) => {
          callback({ success: true })
        }
      )

      await act(async () => {
        await result.current.joinCampaign('campaign-123')
        await result.current.leaveCampaign('campaign-123')
      })

      expect(result.current.subscribedCampaigns).not.toContain('campaign-123')
    })

    it('should throw error when joining while disconnected', async () => {
      const { result } = renderHook(() => useCampaignWebSocket())

      await expect(result.current.joinCampaign('campaign-123')).rejects.toThrow(
        'WebSocket not connected'
      )
    })
  })

  describe('Event Handlers', () => {
    it('should call onJobStatus when job status event is received', async () => {
      const onJobStatus = vi.fn()
      renderHook(() => useCampaignWebSocket({ onJobStatus }))

      await waitFor(() => {
        expect(mockSocket.on).toHaveBeenCalledWith('job:status', expect.any(Function))
      })

      const jobStatusHandler = (mockSocket.on as any).mock.calls.find(
        (call: any[]) => call[0] === 'job:status'
      )?.[1]

      const payload = {
        eventId: 'event-1',
        timestamp: new Date().toISOString(),
        jobId: 'job-1',
        runId: 'run-1',
        campaignId: 'campaign-1',
        status: 'succeeded' as const,
        queue: 'trade.buy',
        type: 'buy-token',
      }

      act(() => {
        jobStatusHandler?.(payload)
      })

      expect(onJobStatus).toHaveBeenCalledWith(payload)
    })

    it('should call onRunStatus when run status event is received', async () => {
      const onRunStatus = vi.fn()
      renderHook(() => useCampaignWebSocket({ onRunStatus }))

      await waitFor(() => {
        expect(mockSocket.on).toHaveBeenCalledWith('run:status', expect.any(Function))
      })

      const runStatusHandler = (mockSocket.on as any).mock.calls.find(
        (call: any[]) => call[0] === 'run:status'
      )?.[1]

      const payload = {
        eventId: 'event-2',
        timestamp: new Date().toISOString(),
        runId: 'run-1',
        campaignId: 'campaign-1',
        status: 'running' as const,
        startedAt: new Date().toISOString(),
      }

      act(() => {
        runStatusHandler?.(payload)
      })

      expect(onRunStatus).toHaveBeenCalledWith(payload)
    })

    it('should call onCampaignStatus when campaign status event is received', async () => {
      const onCampaignStatus = vi.fn()
      renderHook(() => useCampaignWebSocket({ onCampaignStatus }))

      await waitFor(() => {
        expect(mockSocket.on).toHaveBeenCalledWith('campaign:status', expect.any(Function))
      })

      const campaignStatusHandler = (mockSocket.on as any).mock.calls.find(
        (call: any[]) => call[0] === 'campaign:status'
      )?.[1]

      const payload = {
        runId: 'run-1',
        campaignId: 'campaign-1',
        status: 'running',
        metrics: {
          totalJobs: 100,
          succeededJobs: 80,
          failedJobs: 10,
          queuedJobs: 5,
          runningJobs: 5,
          cancelledJobs: 0,
          successRate: 0.8,
          byQueue: {
            'trade.buy': {
              total: 50,
              succeeded: 40,
              failed: 5,
              queued: 3,
              running: 2,
            },
          },
          totalExecutions: 90,
          avgLatencyMs: 150,
        },
        updatedAt: new Date().toISOString(),
      }

      act(() => {
        campaignStatusHandler?.(payload)
      })

      expect(onCampaignStatus).toHaveBeenCalledWith(payload)
    })
  })

  describe('Reconnection Handling', () => {
    it('should handle disconnect and set isConnected to false', async () => {
      const onDisconnect = vi.fn()
      const { result } = renderHook(() => useCampaignWebSocket({ onDisconnect }))

      await waitFor(() => {
        expect(mockSocket.on).toHaveBeenCalledWith('disconnect', expect.any(Function))
      })

      const disconnectHandler = (mockSocket.on as any).mock.calls.find(
        (call: any[]) => call[0] === 'disconnect'
      )?.[1]

      // First connect
      act(() => {
        mockSocket.connected = true
      })

      // Then disconnect
      act(() => {
        mockSocket.connected = false
        disconnectHandler?.('transport close')
      })

      await waitFor(() => {
        expect(result.current.isConnected).toBe(false)
        expect(onDisconnect).toHaveBeenCalled()
      })
    })

    it('should request missed events on reconnection', async () => {
      renderHook(() => useCampaignWebSocket())

      await waitFor(() => {
        expect(mockSocket.on).toHaveBeenCalledWith('connect', expect.any(Function))
      })

      const connectHandler = (mockSocket.on as any).mock.calls.find(
        (call: any[]) => call[0] === 'connect'
      )?.[1]

      // Mock get_subscriptions response with recovered state
      ;(mockSocket.emit as any).mockImplementation(
        (event: string, data: any, callback: Function) => {
          if (event === 'get_subscriptions') {
            callback({
              success: true,
              campaigns: ['campaign-123'],
              recovered: true,
            })
          } else if (event === 'get_missed_events') {
            callback({
              success: true,
              events: [],
            })
          }
        }
      )

      act(() => {
        mockSocket.connected = true
        connectHandler?.()
      })

      await waitFor(() => {
        expect(mockSocket.emit).toHaveBeenCalledWith(
          'get_subscriptions',
          {},
          expect.any(Function)
        )
        expect(mockSocket.emit).toHaveBeenCalledWith(
          'get_missed_events',
          { campaignId: 'campaign-123' },
          expect.any(Function)
        )
      })
    })
  })

  describe('Manual Reconnect', () => {
    it('should allow manual reconnection', async () => {
      const { result } = renderHook(() => useCampaignWebSocket())

      await waitFor(() => {
        expect(mockIo).toHaveBeenCalledTimes(1)
      })

      act(() => {
        result.current.reconnect()
      })

      // Should create new connection
      await waitFor(() => {
        expect(mockIo).toHaveBeenCalledTimes(2)
      })
    })
  })

  describe('Error Handling', () => {
    it('should handle missing authentication token', async () => {
      mockGetSession.mockResolvedValueOnce({
        data: { session: null },
      })

      const onError = vi.fn()
      renderHook(() => useCampaignWebSocket({ onError }))

      await waitFor(() => {
        expect(onError).toHaveBeenCalledWith(expect.any(Error))
      })
    })

    it('should handle failed campaign join', async () => {
      const { result } = renderHook(() => useCampaignWebSocket())

      act(() => {
        mockSocket.connected = true
      })

      ;(mockSocket.emit as any).mockImplementation(
        (event: string, data: any, callback: Function) => {
          if (event === 'join_campaign') {
            callback({ success: false, message: 'Campaign not found' })
          }
        }
      )

      await expect(result.current.joinCampaign('campaign-123')).rejects.toThrow(
        'Campaign not found'
      )
    })
  })
})
