import { Metadata } from 'next'
import AbuseAlertCard from '@/components/admin/AbuseAlertCard'
import SystemHealthWidget from '@/components/admin/SystemHealthWidget'

export const metadata: Metadata = {
  title: 'Abuse Alerts',
}

// Mock data - will be replaced with real API calls in task 13.5
const mockAlerts = [
  {
    id: '1',
    title: 'Unusual Transaction Volume',
    description: 'User has exceeded normal transaction limits by 300% in the last hour.',
    severity: 'critical' as const,
    user: 'user1@example.com',
    campaign: 'Campaign Alpha',
    timestamp: '5 minutes ago',
  },
  {
    id: '2',
    title: 'Multiple Failed Transactions',
    description: 'Campaign showing high failure rate (45%) over the past 2 hours.',
    severity: 'high' as const,
    user: 'user2@example.com',
    campaign: 'Campaign Beta',
    timestamp: '15 minutes ago',
  },
  {
    id: '3',
    title: 'Suspicious Wallet Activity',
    description: 'Wallet address flagged for potential bot-like behavior patterns.',
    severity: 'medium' as const,
    user: 'user3@example.com',
    timestamp: '1 hour ago',
  },
  {
    id: '4',
    title: 'Rate Limit Approaching',
    description: 'User is approaching API rate limits (85% of quota used).',
    severity: 'low' as const,
    user: 'user4@example.com',
    timestamp: '2 hours ago',
  },
]

export default function AlertsPage() {
  const handleViewAlert = (id: string) => {
    console.log('View alert:', id)
    // Will be implemented in task 13.5
  }

  const handleDismissAlert = (id: string) => {
    console.log('Dismiss alert:', id)
    // Will be implemented in task 13.5
  }

  return (
    <div className="space-y-4 md:space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 md:text-3xl">
          Abuse Alerts
        </h1>
        <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
          Monitor and respond to suspicious activity
        </p>
      </div>

      {/* Alert Stats */}
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 md:gap-6">
        <SystemHealthWidget
          title="Active Alerts"
          value="0"
          type="alerts"
          subtitle="Requires attention"
        />
        <SystemHealthWidget
          title="Critical"
          value="0"
          type="alerts"
          subtitle="Urgent action needed"
        />
        <SystemHealthWidget
          title="Resolved Today"
          value="0"
          type="alerts"
          subtitle="Handled issues"
        />
        <SystemHealthWidget
          title="Avg Response Time"
          value="0min"
          type="uptime"
          subtitle="Last 7 days"
        />
      </div>

      {/* Filter Tabs */}
      <div className="flex flex-wrap gap-2 border-b border-gray-200 dark:border-gray-700">
        <button className="border-b-2 border-red-600 px-4 py-2 text-sm font-medium text-red-600 dark:text-red-400">
          All Alerts
        </button>
        <button className="px-4 py-2 text-sm font-medium text-gray-600 transition hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100">
          Critical
        </button>
        <button className="px-4 py-2 text-sm font-medium text-gray-600 transition hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100">
          High
        </button>
        <button className="px-4 py-2 text-sm font-medium text-gray-600 transition hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100">
          Medium
        </button>
        <button className="px-4 py-2 text-sm font-medium text-gray-600 transition hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100">
          Low
        </button>
      </div>

      {/* Alerts List */}
      <div className="space-y-4">
        {mockAlerts.length === 0 ? (
          <div className="rounded-lg border border-gray-200 bg-white p-8 text-center dark:border-gray-700 dark:bg-gray-800 md:p-12">
            <p className="text-sm text-gray-500 dark:text-gray-400">
              No alerts at this time
            </p>
          </div>
        ) : (
          mockAlerts.map((alert) => (
            <AbuseAlertCard
              key={alert.id}
              {...alert}
              onView={handleViewAlert}
              onDismiss={handleDismissAlert}
            />
          ))
        )}
      </div>
    </div>
  )
}
