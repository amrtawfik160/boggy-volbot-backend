'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { campaignApi, type Campaign } from '@/lib/api/campaigns'

export default function CampaignsPage() {
  const router = useRouter()
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

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
    try {
      await campaignApi.start(id)
      loadCampaigns()
    } catch (err: any) {
      alert(err.message || 'Failed to start campaign')
    }
  }

  const handlePauseCampaign = async (id: string) => {
    try {
      await campaignApi.pause(id)
      loadCampaigns()
    } catch (err: any) {
      alert(err.message || 'Failed to pause campaign')
    }
  }

  const handleStopCampaign = async (id: string) => {
    if (!confirm('Are you sure you want to stop this campaign?')) return

    try {
      await campaignApi.stop(id)
      loadCampaigns()
    } catch (err: any) {
      alert(err.message || 'Failed to stop campaign')
    }
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

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-sm text-gray-500">Loading campaigns...</div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Campaigns</h1>
          <p className="mt-1 text-sm text-gray-500">
            Manage your volume generation campaigns
          </p>
        </div>
        <button
          onClick={() => router.push('/campaigns/new')}
          className="inline-flex items-center px-4 py-2 text-sm font-semibold text-white shadow-sm bg-indigo-600 hover:bg-indigo-500"
        >
          Create Campaign
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 text-sm">
          {error}
        </div>
      )}

      <div className="bg-white shadow border border-gray-200">
        <div className="px-4 py-5 sm:p-6">
          {campaigns.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-sm text-gray-500">
                No campaigns yet. Create your first campaign to get started.
              </p>
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
                      Parameters
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
                        <button
                          onClick={() => router.push(`/campaigns/${campaign.id}`)}
                          className="hover:text-indigo-600"
                        >
                          {campaign.name}
                        </button>
                      </td>
                      <td className="px-3 py-4 whitespace-nowrap text-sm">
                        <span className={`inline-flex items-center px-2 py-1 text-xs font-medium ${getStatusBadgeClass(campaign.status)}`}>
                          {campaign.status.charAt(0).toUpperCase() + campaign.status.slice(1)}
                        </span>
                      </td>
                      <td className="px-3 py-4 text-sm text-gray-500">
                        <div className="space-y-1">
                          <div>Slippage: {campaign.params.slippage || 1}%</div>
                          <div>Jito: {campaign.params.useJito ? 'Yes' : 'No'}</div>
                        </div>
                      </td>
                      <td className="px-3 py-4 whitespace-nowrap text-sm text-gray-500">
                        {new Date(campaign.created_at).toLocaleDateString()}
                      </td>
                      <td className="px-3 py-4 whitespace-nowrap text-right text-sm font-medium">
                        <div className="flex justify-end gap-2">
                          {campaign.status === 'draft' && (
                            <button
                              onClick={() => handleStartCampaign(campaign.id)}
                              className="text-green-600 hover:text-green-900"
                            >
                              Start
                            </button>
                          )}
                          {campaign.status === 'active' && (
                            <>
                              <button
                                onClick={() => handlePauseCampaign(campaign.id)}
                                className="text-yellow-600 hover:text-yellow-900"
                              >
                                Pause
                              </button>
                              <button
                                onClick={() => handleStopCampaign(campaign.id)}
                                className="text-red-600 hover:text-red-900"
                              >
                                Stop
                              </button>
                            </>
                          )}
                          {campaign.status === 'paused' && (
                            <>
                              <button
                                onClick={() => handleStartCampaign(campaign.id)}
                                className="text-green-600 hover:text-green-900"
                              >
                                Resume
                              </button>
                              <button
                                onClick={() => handleStopCampaign(campaign.id)}
                                className="text-red-600 hover:text-red-900"
                              >
                                Stop
                              </button>
                            </>
                          )}
                          <button
                            onClick={() => router.push(`/campaigns/${campaign.id}`)}
                            className="text-indigo-600 hover:text-indigo-900"
                          >
                            View
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
