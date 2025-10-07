'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { dashboardApi, type DashboardMetrics } from '@/lib/api/dashboard'
import { campaignApi, type Campaign } from '@/lib/api/campaigns'

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

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-sm text-gray-500">Loading dashboard...</div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="mt-1 text-sm text-gray-500">
          Overview of your volume generation campaigns
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
        <div className="overflow-hidden bg-white px-4 py-5 shadow border border-gray-200">
          <dt className="truncate text-sm font-medium text-gray-500">Active Campaigns</dt>
          <dd className="mt-1 text-3xl font-semibold text-gray-900">
            {metrics?.activeCampaigns || 0}
          </dd>
        </div>

        <div className="overflow-hidden bg-white px-4 py-5 shadow border border-gray-200">
          <dt className="truncate text-sm font-medium text-gray-500">24h Volume</dt>
          <dd className="mt-1 text-3xl font-semibold text-gray-900">
            {formatVolume(metrics?.volume24h || 0)}
          </dd>
        </div>

        <div className="overflow-hidden bg-white px-4 py-5 shadow border border-gray-200">
          <dt className="truncate text-sm font-medium text-gray-500">Total Transactions</dt>
          <dd className="mt-1 text-3xl font-semibold text-gray-900">
            {metrics?.totalTransactions || 0}
          </dd>
        </div>

        <div className="overflow-hidden bg-white px-4 py-5 shadow border border-gray-200">
          <dt className="truncate text-sm font-medium text-gray-500">Success Rate</dt>
          <dd className="mt-1 text-3xl font-semibold text-gray-900">
            {formatSuccessRate(metrics?.successRate || 0)}
          </dd>
        </div>
      </div>

      <div className="bg-white shadow border border-gray-200">
        <div className="px-4 py-5 sm:p-6">
          <h3 className="text-lg font-medium leading-6 text-gray-900 mb-4">
            Recent Campaigns
          </h3>
          {campaigns.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-sm text-gray-500 mb-4">
                No campaigns yet. Create your first campaign to get started.
              </p>
              <button
                onClick={() => router.push('/campaigns/new')}
                className="inline-flex items-center px-3 py-2 text-sm font-semibold text-white shadow-sm bg-indigo-600 hover:bg-indigo-500"
              >
                Create Campaign
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead>
                  <tr>
                    <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Name
                    </th>
                    <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Created
                    </th>
                    <th className="px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {campaigns.map((campaign) => (
                    <tr key={campaign.id} className="hover:bg-gray-50">
                      <td className="px-3 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                        {campaign.name}
                      </td>
                      <td className="px-3 py-4 whitespace-nowrap text-sm">
                        <span className={`inline-flex items-center px-2 py-1 text-xs font-medium ${
                          campaign.status === 'active' ? 'bg-green-100 text-green-800' :
                          campaign.status === 'paused' ? 'bg-yellow-100 text-yellow-800' :
                          campaign.status === 'stopped' ? 'bg-red-100 text-red-800' :
                          'bg-gray-100 text-gray-800'
                        }`}>
                          {campaign.status.charAt(0).toUpperCase() + campaign.status.slice(1)}
                        </span>
                      </td>
                      <td className="px-3 py-4 whitespace-nowrap text-sm text-gray-500">
                        {new Date(campaign.created_at).toLocaleDateString()}
                      </td>
                      <td className="px-3 py-4 whitespace-nowrap text-right text-sm font-medium">
                        <button
                          onClick={() => router.push(`/campaigns/${campaign.id}`)}
                          className="text-indigo-600 hover:text-indigo-900"
                        >
                          View
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="mt-4 text-center">
                <button
                  onClick={() => router.push('/campaigns')}
                  className="text-sm text-indigo-600 hover:text-indigo-900"
                >
                  View all campaigns →
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {metrics && metrics.recentActivity.length > 0 && (
        <div className="bg-white shadow border border-gray-200">
          <div className="px-4 py-5 sm:p-6">
            <h3 className="text-lg font-medium leading-6 text-gray-900 mb-4">
              Recent Activity
            </h3>
            <div className="space-y-3">
              {metrics.recentActivity.map((activity) => (
                <div key={activity.id} className="flex items-start gap-3 text-sm">
                  <div className="flex-shrink-0 w-2 h-2 mt-2 bg-indigo-600" />
                  <div className="flex-1">
                    <p className="text-gray-900">{activity.message}</p>
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
