import { Metadata } from 'next'
import SystemHealthWidget from '@/components/admin/SystemHealthWidget'

export const metadata: Metadata = {
  title: 'Campaigns Overview',
}

// Mock data - will be replaced with real API calls in task 13.5
const mockCampaigns = [
  { id: '1', name: 'Campaign Alpha', user: 'user1@example.com', status: 'active', volume: '1.2M', started: '2024-01-15' },
  { id: '2', name: 'Campaign Beta', user: 'user2@example.com', status: 'paused', volume: '850K', started: '2024-02-20' },
  { id: '3', name: 'Campaign Gamma', user: 'user3@example.com', status: 'stopped', volume: '2.1M', started: '2024-03-10' },
]

export default function CampaignsPage() {
  return (
    <div className="space-y-4 md:space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 md:text-3xl">
          Campaign Management
        </h1>
        <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
          Monitor and control user campaigns
        </p>
      </div>

      {/* Quick Stats */}
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 md:gap-6">
        <SystemHealthWidget
          title="Total Campaigns"
          value="0"
          type="campaigns"
          subtitle="All time"
        />
        <SystemHealthWidget
          title="Active Now"
          value="0"
          type="campaigns"
          subtitle="Currently running"
        />
        <SystemHealthWidget
          title="Paused"
          value="0"
          type="campaigns"
          subtitle="Temporarily stopped"
        />
        <SystemHealthWidget
          title="Total Volume"
          value="0"
          type="campaigns"
          subtitle="Transactions processed"
        />
      </div>

      {/* Campaigns Table */}
      <div className="rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
        <div className="border-b border-gray-200 p-4 dark:border-gray-700 md:p-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            All Campaigns
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-gray-800">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400 md:px-6">
                  Campaign Name
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400 md:px-6">
                  User
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400 md:px-6">
                  Status
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400 md:px-6">
                  Volume
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400 md:px-6">
                  Started
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400 md:px-6">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-white dark:divide-gray-700 dark:bg-gray-800">
              {mockCampaigns.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-sm text-gray-500 dark:text-gray-400 md:px-6">
                    No campaigns found
                  </td>
                </tr>
              ) : (
                mockCampaigns.map((campaign) => (
                  <tr key={campaign.id} className="transition hover:bg-gray-50 dark:hover:bg-gray-700/50">
                    <td className="whitespace-nowrap px-4 py-4 text-sm font-medium text-gray-900 dark:text-gray-100 md:px-6">
                      {campaign.name}
                    </td>
                    <td className="whitespace-nowrap px-4 py-4 text-sm text-gray-500 dark:text-gray-400 md:px-6">
                      {campaign.user}
                    </td>
                    <td className="whitespace-nowrap px-4 py-4 md:px-6">
                      <span
                        className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${
                          campaign.status === 'active'
                            ? 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400'
                            : campaign.status === 'paused'
                            ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400'
                            : 'bg-gray-100 text-gray-800 dark:bg-gray-900/20 dark:text-gray-400'
                        }`}
                      >
                        {campaign.status}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-4 text-sm text-gray-500 dark:text-gray-400 md:px-6">
                      {campaign.volume}
                    </td>
                    <td className="whitespace-nowrap px-4 py-4 text-sm text-gray-500 dark:text-gray-400 md:px-6">
                      {campaign.started}
                    </td>
                    <td className="whitespace-nowrap px-4 py-4 text-sm md:px-6">
                      <div className="flex gap-2">
                        <button className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300">
                          View
                        </button>
                        <button className="text-yellow-600 hover:text-yellow-800 dark:text-yellow-400 dark:hover:text-yellow-300">
                          Pause
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
