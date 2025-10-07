'use client'

import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { campaignApi, type Campaign, type CampaignStatus, type CampaignRun, type ExecutionLog } from '@/lib/api/campaigns'
import { useCampaignWebSocket } from '@/hooks/use-campaign-websocket'
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
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <button
            onClick={() => router.push('/campaigns')}
            className="text-sm text-indigo-600 hover:text-indigo-900 mb-2"
          >
            ← Back to campaigns
          </button>
          <h1 className="text-2xl font-bold text-gray-900">{campaign.name}</h1>
          <div className="mt-2 flex items-center gap-3 flex-wrap">
            <span className={`inline-flex items-center px-2 py-1 text-xs font-medium ${getStatusBadgeClass(campaign.status)}`}>
              {campaign.status.charAt(0).toUpperCase() + campaign.status.slice(1)}
            </span>
            <span className="text-sm text-gray-500">
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

        <div className="flex gap-2">
          {campaign.status === 'draft' && (
            <button
              onClick={handleStart}
              className="px-4 py-2 text-sm font-semibold bg-green-600 text-white shadow-sm hover:bg-green-500"
            >
              Start Campaign
            </button>
          )}
          {campaign.status === 'active' && (
            <>
              <button
                onClick={handlePause}
                className="px-4 py-2 text-sm font-semibold bg-yellow-600 text-white shadow-sm hover:bg-yellow-500"
              >
                Pause
              </button>
              <button
                onClick={handleStop}
                className="px-4 py-2 text-sm font-semibold bg-red-600 text-white shadow-sm hover:bg-red-500"
              >
                Stop
              </button>
            </>
          )}
          {campaign.status === 'paused' && (
            <>
              <button
                onClick={handleStart}
                className="px-4 py-2 text-sm font-semibold bg-green-600 text-white shadow-sm hover:bg-green-500"
              >
                Resume
              </button>
              <button
                onClick={handleStop}
                className="px-4 py-2 text-sm font-semibold bg-red-600 text-white shadow-sm hover:bg-red-500"
              >
                Stop
              </button>
            </>
          )}
        </div>
      </div>

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
          <h3 className="text-lg font-medium leading-6 text-gray-900 mb-4">
            Campaign Parameters
          </h3>
          <dl className="grid grid-cols-2 gap-4 text-sm">
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
              <dd className="mt-1 font-medium">
                {campaign.params.useJito ? `Yes (${campaign.params.jitoTip || 0.0001} SOL tip)` : 'No'}
              </dd>
            </div>
          </dl>
        </div>
      </div>

      {/* Execution Logs */}
      <div className="bg-white shadow border border-gray-200">
        <div className="px-4 py-5 sm:p-6">
          <h3 className="text-lg font-medium leading-6 text-gray-900 mb-4">
            Recent Executions
          </h3>
          {logs.length === 0 ? (
            <p className="text-sm text-gray-500">No executions yet</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead>
                  <tr>
                    <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Type
                    </th>
                    <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Signature
                    </th>
                    <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Latency
                    </th>
                    <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Time
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {logs.map((log) => (
                    <tr key={log.id}>
                      <td className="px-3 py-4 whitespace-nowrap text-sm">
                        <span className={`inline-flex items-center px-2 py-1 text-xs font-medium ${
                          log.result?.type === 'buy' ? 'bg-green-100 text-green-800' : 'bg-blue-100 text-blue-800'
                        }`}>
                          {log.result?.type || 'unknown'}
                        </span>
                      </td>
                      <td className="px-3 py-4 whitespace-nowrap text-sm font-mono text-gray-500">
                        {log.tx_signature ? (
                          <a
                            href={`https://solscan.io/tx/${log.tx_signature}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-indigo-600 hover:text-indigo-900"
                          >
                            {log.tx_signature.slice(0, 8)}...
                          </a>
                        ) : (
                          '-'
                        )}
                      </td>
                      <td className="px-3 py-4 whitespace-nowrap text-sm text-gray-500">
                        {log.latency_ms ? `${log.latency_ms}ms` : '-'}
                      </td>
                      <td className="px-3 py-4 whitespace-nowrap text-sm text-gray-500">
                        {new Date(log.created_at).toLocaleTimeString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Campaign Runs */}
      {runs.length > 0 && (
        <div className="bg-white shadow border border-gray-200">
          <div className="px-4 py-5 sm:p-6">
            <h3 className="text-lg font-medium leading-6 text-gray-900 mb-4">
              Campaign Runs
            </h3>
            <div className="space-y-3">
              {runs.map((run) => (
                <div key={run.id} className="flex items-center justify-between p-3 border border-gray-200">
                  <div>
                    <div className="text-sm font-medium">
                      Run #{run.id.slice(0, 8)}
                    </div>
                    <div className="text-xs text-gray-500">
                      Started: {new Date(run.started_at).toLocaleString()}
                      {run.ended_at && ` • Ended: ${new Date(run.ended_at).toLocaleString()}`}
                    </div>
                  </div>
                  <span className={`inline-flex items-center px-2 py-1 text-xs font-medium ${
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

