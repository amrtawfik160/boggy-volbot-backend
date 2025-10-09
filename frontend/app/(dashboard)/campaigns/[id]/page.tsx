'use client'

import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { campaignApi, type Campaign, type CampaignStatus, type CampaignRun, type ExecutionLog } from '@/lib/api/campaigns'
import { useCampaignWebSocket, type CampaignStatusPayload } from '@/hooks/use-campaign-websocket'
import { toast } from 'sonner'

export default function CampaignDetailPage() {
  const router = useRouter()
  const params = useParams()
  const campaignId = params.id as string

  const [campaign, setCampaign] = useState<Campaign | null>(null)
  const [status, setStatus] = useState<CampaignStatus | null>(null)
  const [runs, setRuns] = useState<CampaignRun[]>([])
  const [logs, setLogs] = useState<ExecutionLog[]>([])
  const [loading, setLoading] = useState(true)
  const [realtimeMetrics, setRealtimeMetrics] = useState<CampaignStatusPayload | null>(null)

  // WebSocket connection for real-time updates
  const {
    isConnected,
    isAuthenticated,
    joinCampaign,
    leaveCampaign,
    error: wsError,
  } = useCampaignWebSocket({
    onJobStatus: (payload) => {
      // Reload logs when job status changes
      if (payload.campaignId === campaignId) {
        loadLogs()
      }
    },
    onRunStatus: (payload) => {
      // Update status and runs when run status changes
      if (payload.campaignId === campaignId) {
        loadStatus()
        loadRuns()
      }
    },
    onCampaignStatus: (payload) => {
      // Update real-time metrics when campaign status changes
      if (payload.campaignId === campaignId) {
        console.log('Real-time metrics update:', payload.metrics)
        setRealtimeMetrics(payload)
      }
    },
    onConnect: () => {
      console.log('WebSocket connected, joining campaign:', campaignId)
    },
    onError: (error) => {
      console.error('WebSocket error:', error)
    },
  })

  useEffect(() => {
    loadCampaignData()
  }, [campaignId])

  // Join campaign room when WebSocket is connected
  useEffect(() => {
    if (isConnected && isAuthenticated && campaignId) {
      joinCampaign(campaignId).catch((err) => {
        console.error('Failed to join campaign room:', err)
      })

      return () => {
        leaveCampaign(campaignId).catch((err) => {
          console.error('Failed to leave campaign room:', err)
        })
      }
    }
  }, [isConnected, isAuthenticated, campaignId, joinCampaign, leaveCampaign])

  const loadCampaignData = async () => {
    try {
      setLoading(true)
      const [campaignData, statusData, runsData, logsData] = await Promise.all([
        campaignApi.get(campaignId),
        campaignApi.getStatus(campaignId).catch(() => null),
        campaignApi.getRuns(campaignId).catch(() => []),
        campaignApi.getLogs(campaignId, 50).catch(() => []),
      ])

      setCampaign(campaignData)
      setStatus(statusData)
      setRuns(runsData)
      setLogs(logsData)
    } catch (err: any) {
      toast.error(err.message || 'Failed to load campaign')
      router.push('/campaigns')
    } finally {
      setLoading(false)
    }
  }

  const loadStatus = async () => {
    try {
      const statusData = await campaignApi.getStatus(campaignId)
      setStatus(statusData)
    } catch (err) {
      console.error('Failed to refresh status:', err)
    }
  }

  const loadRuns = async () => {
    try {
      const runsData = await campaignApi.getRuns(campaignId)
      setRuns(runsData)
    } catch (err) {
      console.error('Failed to refresh runs:', err)
    }
  }

  const loadLogs = async () => {
    try {
      const logsData = await campaignApi.getLogs(campaignId, 50)
      setLogs(logsData)
    } catch (err) {
      console.error('Failed to refresh logs:', err)
    }
  }

  const handleStart = async () => {
    const toastId = toast.loading('Starting campaign...')
    try {
      await campaignApi.start(campaignId)
      toast.success('Campaign started successfully', { id: toastId })
      loadCampaignData()
    } catch (err: any) {
      toast.error(err.message || 'Failed to start campaign', { id: toastId })
    }
  }

  const handlePause = async () => {
    const toastId = toast.loading('Pausing campaign...')
    try {
      await campaignApi.pause(campaignId)
      toast.success('Campaign paused successfully', { id: toastId })
      loadCampaignData()
    } catch (err: any) {
      toast.error(err.message || 'Failed to pause campaign', { id: toastId })
    }
  }

  const handleStop = async () => {
    if (!confirm('Are you sure you want to stop this campaign?')) return

    const toastId = toast.loading('Stopping campaign...')
    try {
      await campaignApi.stop(campaignId)
      toast.success('Campaign stopped successfully', { id: toastId })
      loadCampaignData()
    } catch (err: any) {
      toast.error(err.message || 'Failed to stop campaign', { id: toastId })
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-sm text-gray-500">Loading campaign...</div>
      </div>
    )
  }

  if (!campaign) {
    return null
  }

  const getStatusBadgeClass = (status: string) => {
    const classes = {
      draft: 'bg-gray-100 text-gray-800',
      active: 'bg-green-100 text-green-800',
      paused: 'bg-yellow-100 text-yellow-800',
      stopped: 'bg-red-100 text-red-800',
      completed: 'bg-blue-100 text-blue-800',
    }
    return classes[status as keyof typeof classes] || classes.draft
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex-1 min-w-0">
          <button
            onClick={() => router.push('/campaigns')}
            className="text-sm text-indigo-600 hover:text-indigo-900 mb-2 inline-block"
          >
            ← Back to campaigns
          </button>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900 break-words">{campaign.name}</h1>
          <div className="mt-2 flex items-center gap-2 sm:gap-3 flex-wrap">
            <span className={`inline-flex items-center px-2 py-1 text-xs font-medium ${getStatusBadgeClass(campaign.status)}`}>
              {campaign.status.charAt(0).toUpperCase() + campaign.status.slice(1)}
            </span>
            <span className="text-xs sm:text-sm text-gray-500">
              Created {new Date(campaign.created_at).toLocaleDateString()}
            </span>
            {/* WebSocket Connection Status */}
            <div className="flex items-center gap-1.5">
              <span className={`h-2 w-2 rounded-full ${isConnected ? 'bg-green-500 animate-pulse' : 'bg-gray-400'}`} />
              <span className="text-xs text-gray-500">
                {isConnected ? 'Live' : 'Offline'}
              </span>
            </div>
          </div>
          {wsError && (
            <div className="mt-2 text-xs text-red-600">
              Connection error: {wsError.message}
            </div>
          )}
        </div>

        <div className="flex gap-2 flex-wrap sm:flex-nowrap sm:shrink-0">
          {campaign.status === 'draft' && (
            <button
              onClick={handleStart}
              className="flex-1 sm:flex-none px-4 py-2 text-sm font-semibold bg-green-600 text-white shadow-sm hover:bg-green-500"
            >
              Start Campaign
            </button>
          )}
          {campaign.status === 'active' && (
            <>
              <button
                onClick={handlePause}
                className="flex-1 sm:flex-none px-4 py-2 text-sm font-semibold bg-yellow-600 text-white shadow-sm hover:bg-yellow-500"
              >
                Pause
              </button>
              <button
                onClick={handleStop}
                className="flex-1 sm:flex-none px-4 py-2 text-sm font-semibold bg-red-600 text-white shadow-sm hover:bg-red-500"
              >
                Stop
              </button>
            </>
          )}
          {campaign.status === 'paused' && (
            <>
              <button
                onClick={handleStart}
                className="flex-1 sm:flex-none px-4 py-2 text-sm font-semibold bg-green-600 text-white shadow-sm hover:bg-green-500"
              >
                Resume
              </button>
              <button
                onClick={handleStop}
                className="flex-1 sm:flex-none px-4 py-2 text-sm font-semibold bg-red-600 text-white shadow-sm hover:bg-red-500"
              >
                Stop
              </button>
            </>
          )}
        </div>
      </div>

      {/* Real-time Metrics */}
      {realtimeMetrics && (
        <div className="bg-gradient-to-r from-indigo-50 to-purple-50 border border-indigo-200 px-4 py-4 shadow">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-indigo-900 flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
              Live Campaign Metrics
            </h3>
            <span className="text-xs text-indigo-600">
              Updated {new Date(realtimeMetrics.updatedAt).toLocaleTimeString()}
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-white/80 px-3 py-2 border border-indigo-100">
              <dt className="text-xs font-medium text-gray-600">Total Jobs</dt>
              <dd className="mt-1 text-lg font-bold text-gray-900">{realtimeMetrics.metrics.totalJobs}</dd>
            </div>

            <div className="bg-white/80 px-3 py-2 border border-green-100">
              <dt className="text-xs font-medium text-green-600">Succeeded</dt>
              <dd className="mt-1 text-lg font-bold text-green-700">{realtimeMetrics.metrics.succeededJobs}</dd>
            </div>

            <div className="bg-white/80 px-3 py-2 border border-red-100">
              <dt className="text-xs font-medium text-red-600">Failed</dt>
              <dd className="mt-1 text-lg font-bold text-red-700">{realtimeMetrics.metrics.failedJobs}</dd>
            </div>

            <div className="bg-white/80 px-3 py-2 border border-indigo-100">
              <dt className="text-xs font-medium text-indigo-600">Success Rate</dt>
              <dd className="mt-1 text-lg font-bold text-indigo-700">
                {(realtimeMetrics.metrics.successRate * 100).toFixed(1)}%
              </dd>
            </div>

            <div className="bg-white/80 px-3 py-2 border border-yellow-100">
              <dt className="text-xs font-medium text-yellow-700">Queued</dt>
              <dd className="mt-1 text-lg font-bold text-yellow-800">{realtimeMetrics.metrics.queuedJobs}</dd>
            </div>

            <div className="bg-white/80 px-3 py-2 border border-blue-100">
              <dt className="text-xs font-medium text-blue-600">Running</dt>
              <dd className="mt-1 text-lg font-bold text-blue-700">{realtimeMetrics.metrics.runningJobs}</dd>
            </div>

            <div className="bg-white/80 px-3 py-2 border border-purple-100">
              <dt className="text-xs font-medium text-purple-600">Executions</dt>
              <dd className="mt-1 text-lg font-bold text-purple-700">{realtimeMetrics.metrics.totalExecutions}</dd>
            </div>

            <div className="bg-white/80 px-3 py-2 border border-gray-100">
              <dt className="text-xs font-medium text-gray-600">Avg Latency</dt>
              <dd className="mt-1 text-lg font-bold text-gray-700">{realtimeMetrics.metrics.avgLatencyMs}ms</dd>
            </div>
          </div>

          {/* Queue Breakdown */}
          {Object.keys(realtimeMetrics.metrics.byQueue).length > 0 && (
            <div className="mt-3 pt-3 border-t border-indigo-200">
              <h4 className="text-xs font-semibold text-indigo-900 mb-2">Queue Breakdown</h4>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
                {Object.entries(realtimeMetrics.metrics.byQueue).map(([queueName, stats]) => (
                  <div key={queueName} className="bg-white/60 px-2 py-1.5 border border-indigo-100">
                    <div className="font-medium text-gray-700 mb-1">{queueName}</div>
                    <div className="text-gray-600 space-y-0.5">
                      <div>Total: {stats.total}</div>
                      <div>✓ {stats.succeeded} | ✗ {stats.failed} | ⏳ {stats.running}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Queue Stats */}
      {status && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="bg-white px-4 py-5 shadow border border-gray-200">
            <dt className="text-sm font-medium text-gray-500">Gather Queue</dt>
            <dd className="mt-1 text-2xl font-semibold text-gray-900">
              {status.queueStats.gather.active + status.queueStats.gather.waiting}
            </dd>
            <dd className="text-xs text-gray-500">
              {status.queueStats.gather.active} active, {status.queueStats.gather.waiting} waiting
            </dd>
          </div>

          <div className="bg-white px-4 py-5 shadow border border-gray-200">
            <dt className="text-sm font-medium text-gray-500">Buy Queue</dt>
            <dd className="mt-1 text-2xl font-semibold text-gray-900">
              {status.queueStats.buy.active + status.queueStats.buy.waiting}
            </dd>
            <dd className="text-xs text-gray-500">
              {status.queueStats.buy.active} active, {status.queueStats.buy.waiting} waiting
            </dd>
          </div>

          <div className="bg-white px-4 py-5 shadow border border-gray-200">
            <dt className="text-sm font-medium text-gray-500">Sell Queue</dt>
            <dd className="mt-1 text-2xl font-semibold text-gray-900">
              {status.queueStats.sell.active + status.queueStats.sell.waiting}
            </dd>
            <dd className="text-xs text-gray-500">
              {status.queueStats.sell.active} active, {status.queueStats.sell.waiting} waiting
            </dd>
          </div>
        </div>
      )}

      {/* Parameters */}
      <div className="bg-white shadow border border-gray-200">
        <div className="px-4 py-5 sm:p-6">
          <h3 className="text-base sm:text-lg font-medium leading-6 text-gray-900 mb-4">
            Campaign Parameters
          </h3>
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 text-sm">
            <div>
              <dt className="text-gray-500">Slippage</dt>
              <dd className="mt-1 font-medium">{campaign.params.slippage || 1}%</dd>
            </div>
            <div>
              <dt className="text-gray-500">Min Transaction</dt>
              <dd className="mt-1 font-medium">{campaign.params.minTxSize || 0.01} SOL</dd>
            </div>
            <div>
              <dt className="text-gray-500">Max Transaction</dt>
              <dd className="mt-1 font-medium">{campaign.params.maxTxSize || 0.1} SOL</dd>
            </div>
            <div>
              <dt className="text-gray-500">Jito Execution</dt>
              <dd className="mt-1 font-medium break-words">
                {campaign.params.useJito ? `Yes (${campaign.params.jitoTip || 0.0001} SOL tip)` : 'No'}
              </dd>
            </div>
          </dl>
        </div>
      </div>

      {/* Execution Logs */}
      <div className="bg-white shadow border border-gray-200">
        <div className="px-4 py-5 sm:p-6">
          <h3 className="text-base sm:text-lg font-medium leading-6 text-gray-900 mb-4">
            Recent Executions
          </h3>
          {logs.length === 0 ? (
            <p className="text-sm text-gray-500">No executions yet</p>
          ) : (
            <div className="overflow-x-auto -mx-4 sm:mx-0">
              <div className="inline-block min-w-full align-middle px-4 sm:px-0">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead>
                    <tr>
                      <th className="px-2 sm:px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Type
                      </th>
                      <th className="px-2 sm:px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Signature
                      </th>
                      <th className="px-2 sm:px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Latency
                      </th>
                      <th className="px-2 sm:px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Time
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {logs.map((log) => (
                      <tr key={log.id}>
                        <td className="px-2 sm:px-3 py-3 sm:py-4 whitespace-nowrap text-xs sm:text-sm">
                          <span className={`inline-flex items-center px-2 py-1 text-xs font-medium ${
                            log.result?.type === 'buy' ? 'bg-green-100 text-green-800' : 'bg-blue-100 text-blue-800'
                          }`}>
                            {log.result?.type || 'unknown'}
                          </span>
                        </td>
                        <td className="px-2 sm:px-3 py-3 sm:py-4 whitespace-nowrap text-xs sm:text-sm font-mono text-gray-500">
                          {log.tx_signature ? (
                            <a
                              href={`https://solscan.io/tx/${log.tx_signature}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-indigo-600 hover:text-indigo-900"
                            >
                              {log.tx_signature.slice(0, 6)}...
                            </a>
                          ) : (
                            '-'
                          )}
                        </td>
                        <td className="px-2 sm:px-3 py-3 sm:py-4 whitespace-nowrap text-xs sm:text-sm text-gray-500">
                          {log.latency_ms ? `${log.latency_ms}ms` : '-'}
                        </td>
                        <td className="px-2 sm:px-3 py-3 sm:py-4 whitespace-nowrap text-xs sm:text-sm text-gray-500">
                          {new Date(log.created_at).toLocaleTimeString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Campaign Runs */}
      {runs.length > 0 && (
        <div className="bg-white shadow border border-gray-200">
          <div className="px-4 py-5 sm:p-6">
            <h3 className="text-base sm:text-lg font-medium leading-6 text-gray-900 mb-4">
              Campaign Runs
            </h3>
            <div className="space-y-3">
              {runs.map((run) => (
                <div key={run.id} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 p-3 border border-gray-200">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium truncate">
                      Run #{run.id.slice(0, 8)}
                    </div>
                    <div className="text-xs text-gray-500 break-words">
                      Started: {new Date(run.started_at).toLocaleString()}
                      {run.ended_at && (
                        <span className="block sm:inline">
                          <span className="hidden sm:inline"> • </span>
                          Ended: {new Date(run.ended_at).toLocaleString()}
                        </span>
                      )}
                    </div>
                  </div>
                  <span className={`inline-flex items-center justify-center px-2 py-1 text-xs font-medium self-start sm:self-auto ${
                    run.status === 'running' ? 'bg-green-100 text-green-800' :
                    run.status === 'paused' ? 'bg-yellow-100 text-yellow-800' :
                    run.status === 'stopped' ? 'bg-red-100 text-red-800' :
                    run.status === 'completed' ? 'bg-blue-100 text-blue-800' :
                    'bg-gray-100 text-gray-800'
                  }`}>
                    {run.status}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

