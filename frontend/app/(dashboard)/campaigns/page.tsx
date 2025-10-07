'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { campaignApi, type Campaign } from '@/lib/api/campaigns'
import {
  StatusBadge,
  DataTable,
  DataTableContainer,
  LoadingSpinner,
  type Column,
} from '@/components/dashboard'
import { useCampaignWebSocket } from '@/hooks/use-campaign-websocket'
import { toast } from 'sonner'

export default function CampaignsPage() {
  const router = useRouter()
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // WebSocket connection for real-time updates
  const { isConnected } = useCampaignWebSocket({
    onRunStatus: () => {
      // Reload campaigns when any run status changes
      loadCampaigns()
    },
  })

  useEffect(() => {
    loadCampaigns()
  }, [])

  const loadCampaigns = async () => {
    try {
      setLoading(true)
      const data = await campaignApi.list()
      setCampaigns(data)
      setError(null)
    } catch (err: any) {
      setError(err.message || 'Failed to load campaigns')
    } finally {
      setLoading(false)
    }
  }

  const handleStartCampaign = async (id: string) => {
    const toastId = toast.loading('Starting campaign...')
    try {
      await campaignApi.start(id)
      toast.success('Campaign started successfully', { id: toastId })
      loadCampaigns()
    } catch (err: any) {
      toast.error(err.message || 'Failed to start campaign', { id: toastId })
    }
  }

  const handlePauseCampaign = async (id: string) => {
    const toastId = toast.loading('Pausing campaign...')
    try {
      await campaignApi.pause(id)
      toast.success('Campaign paused successfully', { id: toastId })
      loadCampaigns()
    } catch (err: any) {
      toast.error(err.message || 'Failed to pause campaign', { id: toastId })
    }
  }

  const handleStopCampaign = async (id: string) => {
    if (!confirm('Are you sure you want to stop this campaign?')) return

    const toastId = toast.loading('Stopping campaign...')
    try {
      await campaignApi.stop(id)
      toast.success('Campaign stopped successfully', { id: toastId })
      loadCampaigns()
    } catch (err: any) {
      toast.error(err.message || 'Failed to stop campaign', { id: toastId })
    }
  }

  // Define columns for campaigns table
  const campaignColumns: Column<Campaign>[] = [
    {
      key: 'name',
      header: 'Name',
      render: (campaign) => (
        <button
          onClick={() => router.push(`/campaigns/${campaign.id}`)}
          className="hover:text-indigo-600 font-medium text-gray-900 text-left transition-colors"
        >
          {campaign.name}
        </button>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (campaign) => <StatusBadge status={campaign.status} pulse />,
    },
    {
      key: 'parameters',
      header: 'Parameters',
      hideOnMobile: true,
      render: (campaign) => (
        <div className="space-y-1 text-gray-500">
          <div>Slippage: {campaign.params.slippage || 1}%</div>
          <div>Jito: {campaign.params.useJito ? 'Yes' : 'No'}</div>
        </div>
      ),
    },
    {
      key: 'created',
      header: 'Created',
      hideOnMobile: true,
      render: (campaign) => (
        <span className="text-gray-500">
          {new Date(campaign.created_at).toLocaleDateString()}
        </span>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right',
      render: (campaign) => (
        <div className="flex justify-end gap-3 flex-wrap">
          {campaign.status === 'draft' && (
            <button
              onClick={(e) => {
                e.stopPropagation()
                handleStartCampaign(campaign.id)
              }}
              className="text-green-600 hover:text-green-900 transition-colors"
            >
              Start
            </button>
          )}
          {campaign.status === 'active' && (
            <>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  handlePauseCampaign(campaign.id)
                }}
                className="text-yellow-600 hover:text-yellow-900 transition-colors"
              >
                Pause
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  handleStopCampaign(campaign.id)
                }}
                className="text-red-600 hover:text-red-900 transition-colors"
              >
                Stop
              </button>
            </>
          )}
          {campaign.status === 'paused' && (
            <>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  handleStartCampaign(campaign.id)
                }}
                className="text-green-600 hover:text-green-900 transition-colors"
              >
                Resume
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  handleStopCampaign(campaign.id)
                }}
                className="text-red-600 hover:text-red-900 transition-colors"
              >
                Stop
              </button>
            </>
          )}
          <button
            onClick={(e) => {
              e.stopPropagation()
              router.push(`/campaigns/${campaign.id}`)
            }}
            className="text-indigo-600 hover:text-indigo-900 transition-colors"
          >
            View
          </button>
        </div>
      ),
    },
  ]

  if (loading) {
    return <LoadingSpinner centered message="Loading campaigns..." />
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Campaigns</h1>
            {/* WebSocket Connection Status */}
            <div className="flex items-center gap-1.5">
              <span className={`h-2 w-2 rounded-full ${isConnected ? 'bg-green-500 animate-pulse' : 'bg-gray-400'}`} />
              <span className="text-xs text-gray-500">
                {isConnected ? 'Live' : 'Offline'}
              </span>
            </div>
          </div>
          <p className="mt-1 text-sm text-gray-500">
            Manage your volume generation campaigns
          </p>
        </div>
        <button
          onClick={() => router.push('/campaigns/new')}
          className="w-full sm:w-auto inline-flex items-center justify-center px-4 py-2 text-sm font-semibold text-white shadow-sm bg-indigo-600 hover:bg-indigo-500 transition-colors"
        >
          Create Campaign
        </button>
      </div>

      {/* Error Alert */}
      {error && (
        <div
          className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 text-sm"
          role="alert"
        >
          {error}
        </div>
      )}

      {/* Campaigns Table */}
      <DataTableContainer>
        <DataTable
          data={campaigns}
          columns={campaignColumns}
          keyExtractor={(campaign) => campaign.id}
          emptyMessage="No campaigns yet. Create your first campaign to get started."
          emptyAction={{
            label: 'Create Campaign',
            onClick: () => router.push('/campaigns/new'),
          }}
          onRowClick={(campaign) => router.push(`/campaigns/${campaign.id}`)}
        />
      </DataTableContainer>
    </div>
  )
}
