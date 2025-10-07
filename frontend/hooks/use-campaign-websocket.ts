import { useEffect, useRef, useState, useCallback } from 'react'
import { io, Socket } from 'socket.io-client'
import { createClient } from '@/lib/supabase/client'

interface JobStatusPayload {
  eventId: string
  timestamp: string
  jobId: string
  runId: string
  campaignId: string
  status: 'queued' | 'processing' | 'succeeded' | 'failed' | 'cancelled'
  queue: string
  type: string
  attempts?: number
  error?: any
}

interface RunStatusPayload {
  eventId: string
  timestamp: string
  runId: string
  campaignId: string
  status: 'running' | 'paused' | 'stopped' | 'completed' | 'failed'
  startedAt: string
  endedAt?: string
  summary?: any
}

interface WebSocketHookOptions {
  onJobStatus?: (payload: JobStatusPayload) => void
  onRunStatus?: (payload: RunStatusPayload) => void
  onConnect?: () => void
  onDisconnect?: () => void
  onError?: (error: Error) => void
}

interface WebSocketHookReturn {
  isConnected: boolean
  isAuthenticated: boolean
  subscribedCampaigns: string[]
  joinCampaign: (campaignId: string) => Promise<void>
  leaveCampaign: (campaignId: string) => Promise<void>
  error: Error | null
  reconnect: () => void
}

export function useCampaignWebSocket(
  options: WebSocketHookOptions = {}
): WebSocketHookReturn {
  const {
    onJobStatus,
    onRunStatus,
    onConnect,
    onDisconnect,
    onError,
  } = options

  const [isConnected, setIsConnected] = useState(false)
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [subscribedCampaigns, setSubscribedCampaigns] = useState<string[]>([])
  const [error, setError] = useState<Error | null>(null)

  const socketRef = useRef<Socket | null>(null)
  const supabaseRef = useRef(createClient())
  const reconnectTimeoutRef = useRef<NodeJS.Timeout>()

  // Get WebSocket URL from environment or default to localhost
  const wsUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'

  const connect = useCallback(async () => {
    try {
      // Get authentication token from Supabase
      const { data: { session } } = await supabaseRef.current.auth.getSession()

      if (!session?.access_token) {
        throw new Error('No authentication token available')
      }

      // Disconnect existing socket if any
      if (socketRef.current) {
        socketRef.current.disconnect()
      }

      // Create new socket connection with authentication
      const socket = io(`${wsUrl}/campaigns`, {
        auth: {
          token: session.access_token,
        },
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        reconnectionAttempts: 5,
      })

      socketRef.current = socket

      // Connection event handlers
      socket.on('connect', () => {
        console.log('[WebSocket] Connected:', socket.id)
        setIsConnected(true)
        setIsAuthenticated(true)
        setError(null)
        onConnect?.()

        // Request subscriptions to check if we recovered from a previous session
        socket.emit('get_subscriptions', {}, (response: any) => {
          if (response.success && response.campaigns) {
            setSubscribedCampaigns(response.campaigns)

            // If recovered, request missed events for each campaign
            if (response.recovered) {
              console.log('[WebSocket] Connection recovered, requesting missed events')
              response.campaigns.forEach((campaignId: string) => {
                socket.emit('get_missed_events', { campaignId }, (missedEventsResponse: any) => {
                  if (missedEventsResponse.success && missedEventsResponse.events) {
                    // Process missed events
                    missedEventsResponse.events.forEach((event: any) => {
                      if (event.type === 'job:status' && onJobStatus) {
                        onJobStatus(event.payload)
                      } else if (event.type === 'run:status' && onRunStatus) {
                        onRunStatus(event.payload)
                      }
                    })
                  }
                })
              })
            }
          }
        })
      })

      socket.on('disconnect', (reason) => {
        console.log('[WebSocket] Disconnected:', reason)
        setIsConnected(false)
        onDisconnect?.()

        // Automatically reconnect if disconnected unexpectedly
        if (reason === 'io server disconnect' || reason === 'io client disconnect') {
          // Server or client initiated disconnect - don't auto reconnect
          setIsAuthenticated(false)
        }
      })

      socket.on('connect_error', (err) => {
        console.error('[WebSocket] Connection error:', err.message)
        const connectionError = new Error(`WebSocket connection failed: ${err.message}`)
        setError(connectionError)
        setIsConnected(false)
        setIsAuthenticated(false)
        onError?.(connectionError)
      })

      // Campaign event handlers
      socket.on('job:status', (payload: JobStatusPayload) => {
        console.log('[WebSocket] Job status update:', payload)
        onJobStatus?.(payload)
      })

      socket.on('run:status', (payload: RunStatusPayload) => {
        console.log('[WebSocket] Run status update:', payload)
        onRunStatus?.(payload)
      })

      // Ping/pong for connection health check
      socket.on('pong', () => {
        console.log('[WebSocket] Pong received')
      })

    } catch (err) {
      const connectionError = err instanceof Error ? err : new Error('Failed to connect to WebSocket')
      console.error('[WebSocket] Connection setup failed:', connectionError)
      setError(connectionError)
      setIsConnected(false)
      setIsAuthenticated(false)
      onError?.(connectionError)
    }
  }, [wsUrl, onConnect, onDisconnect, onJobStatus, onRunStatus, onError])

  const joinCampaign = useCallback(async (campaignId: string) => {
    if (!socketRef.current?.connected) {
      throw new Error('WebSocket not connected')
    }

    return new Promise<void>((resolve, reject) => {
      socketRef.current?.emit('join_campaign', { campaignId }, (response: any) => {
        if (response.success) {
          console.log('[WebSocket] Joined campaign:', campaignId)
          setSubscribedCampaigns((prev) =>
            prev.includes(campaignId) ? prev : [...prev, campaignId]
          )
          resolve()
        } else {
          const joinError = new Error(response.message || 'Failed to join campaign')
          console.error('[WebSocket] Failed to join campaign:', joinError)
          reject(joinError)
        }
      })
    })
  }, [])

  const leaveCampaign = useCallback(async (campaignId: string) => {
    if (!socketRef.current?.connected) {
      throw new Error('WebSocket not connected')
    }

    return new Promise<void>((resolve, reject) => {
      socketRef.current?.emit('leave_campaign', { campaignId }, (response: any) => {
        if (response.success) {
          console.log('[WebSocket] Left campaign:', campaignId)
          setSubscribedCampaigns((prev) => prev.filter((id) => id !== campaignId))
          resolve()
        } else {
          const leaveError = new Error(response.message || 'Failed to leave campaign')
          console.error('[WebSocket] Failed to leave campaign:', leaveError)
          reject(leaveError)
        }
      })
    })
  }, [])

  const reconnect = useCallback(() => {
    console.log('[WebSocket] Manual reconnect triggered')
    connect()
  }, [connect])

  // Connect on mount and cleanup on unmount
  useEffect(() => {
    connect()

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current)
      }
      if (socketRef.current) {
        console.log('[WebSocket] Cleaning up connection')
        socketRef.current.disconnect()
        socketRef.current = null
      }
    }
  }, [connect])

  return {
    isConnected,
    isAuthenticated,
    subscribedCampaigns,
    joinCampaign,
    leaveCampaign,
    error,
    reconnect,
  }
}
