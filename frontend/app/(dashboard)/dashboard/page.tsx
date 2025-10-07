'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { dashboardApi, type DashboardMetrics } from '@/lib/api/dashboard'
import { campaignApi, type Campaign } from '@/lib/api/campaigns'
import {
  MetricCard,
  MetricCardGrid,
  StatusBadge,
  DataTable,
  DataTableContainer,
  LoadingSpinner,
  EmptyState,
  type Column,
} from '@/components/dashboard'

export default function DashboardPage() {
  const router = useRouter()
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null)
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadDashboardData()
  }, [])

  const loadDashboardData = async () => {
    try {
      setLoading(true)
      const [metricsData, campaignsData] = await Promise.all([
        dashboardApi.getMetrics().catch(() => ({
          activeCampaigns: 0,
          volume24h: 0,
          totalTransactions: 0,
          successRate: 0,
          recentActivity: [],
        })),
        campaignApi.list().catch(() => []),
      ])
      setMetrics(metricsData)
      setCampaigns(campaignsData.slice(0, 5))
    } catch (err) {
      console.error('Failed to load dashboard:', err)
    } finally {
      setLoading(false)
    }
  }

  const formatVolume = (volume: number) => {
    if (volume >= 1000000) return `$${(volume / 1000000).toFixed(2)}M`
    if (volume >= 1000) return `$${(volume / 1000).toFixed(2)}K`
    return `$${volume.toFixed(2)}`
  }

  const formatSuccessRate = (rate: number) => {
    if (rate === 0) return '-'
    return `${(rate * 100).toFixed(1)}%`
  }

  // Define columns for campaigns table
  const campaignColumns: Column<Campaign>[] = [
    {
      key: 'name',
      header: 'Name',
      render: (campaign) => (
        <span className="font-medium text-gray-900">{campaign.name}</span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (campaign) => <StatusBadge status={campaign.status} pulse />,
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
        <button
          onClick={(e) => {
            e.stopPropagation()
            router.push(`/campaigns/${campaign.id}`)
          }}
          className="text-indigo-600 hover:text-indigo-900 transition-colors"
        >
          View
        </button>
      ),
    },
  ]

  if (loading) {
    return <LoadingSpinner centered message="Loading dashboard..." />
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="mt-1 text-sm text-gray-500">
          Overview of your volume generation campaigns
        </p>
      </div>

      {/* Metrics Cards */}
      <MetricCardGrid>
        <MetricCard
          label="Active Campaigns"
          value={metrics?.activeCampaigns || 0}
          onClick={() => router.push('/campaigns')}
        />
        <MetricCard
          label="24h Volume"
          value={formatVolume(metrics?.volume24h || 0)}
        />
        <MetricCard
          label="Total Transactions"
          value={metrics?.totalTransactions || 0}
        />
        <MetricCard
          label="Success Rate"
          value={formatSuccessRate(metrics?.successRate || 0)}
        />
      </MetricCardGrid>

      {/* Recent Campaigns */}
      <DataTableContainer
        title="Recent Campaigns"
        action={{
          label: 'View all →',
          onClick: () => router.push('/campaigns'),
        }}
      >
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

      {/* Recent Activity */}
      {metrics && metrics.recentActivity.length > 0 && (
        <div className="bg-white shadow border border-gray-200">
          <div className="px-4 py-5 sm:p-6">
            <h3 className="text-base sm:text-lg font-medium leading-6 text-gray-900 mb-4">
              Recent Activity
            </h3>
            <div className="space-y-3">
              {metrics.recentActivity.map((activity) => (
                <div key={activity.id} className="flex items-start gap-3 text-sm">
                  <div className="flex-shrink-0 w-2 h-2 mt-2 bg-indigo-600 rounded-full" aria-hidden="true" />
                  <div className="flex-1 min-w-0">
                    <p className="text-gray-900 break-words">{activity.message}</p>
                    <p className="text-gray-500 text-xs mt-1">
                      {new Date(activity.timestamp).toLocaleString()}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
