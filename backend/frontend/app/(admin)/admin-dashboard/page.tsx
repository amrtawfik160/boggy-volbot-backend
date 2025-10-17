import { Metadata } from 'next'
import SystemHealthWidget from '@/components/admin/SystemHealthWidget'
import MetricsChart from '@/components/admin/MetricsChart'
import StatusIndicator from '@/components/admin/StatusIndicator'

export const metadata: Metadata = {
  title: 'Admin Dashboard',
}

export default function AdminDashboardPage() {
  // Mock data - will be replaced with real API calls in task 13.5
  const mockChartData = {
    requests: [120, 150, 170, 140, 200, 180, 210, 190, 220, 240, 230, 250],
    errors: [2, 3, 1, 4, 2, 1, 3, 2, 1, 2, 3, 1],
    categories: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
  }

  return (
    <div className="space-y-4 md:space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 md:text-3xl">
          Admin Dashboard
        </h1>
        <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
          System overview and health monitoring
        </p>
      </div>

      {/* System Status Banner */}
      <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              System Status
            </h2>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              All systems operational
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <StatusIndicator status="online" label="API Server" />
            <StatusIndicator status="online" label="Workers" />
            <StatusIndicator status="online" label="Database" />
          </div>
        </div>
      </div>

      {/* Health Widgets Grid */}
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 md:gap-6">
        <SystemHealthWidget
          title="Total Users"
          value="0"
          type="users"
          subtitle="Registered accounts"
        />
        <SystemHealthWidget
          title="Active Campaigns"
          value="0"
          type="campaigns"
          subtitle="Currently running"
        />
        <SystemHealthWidget
          title="System Uptime"
          value="99.9%"
          type="uptime"
          subtitle="Last 30 days"
        />
        <SystemHealthWidget
          title="Active Alerts"
          value="0"
          type="alerts"
          subtitle="Requires attention"
        />
      </div>

      {/* Charts Section */}
      <div className="grid gap-4 grid-cols-1 lg:grid-cols-2 md:gap-6">
        <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800 md:p-6">
          <MetricsChart
            title="API Requests (Last 12 Months)"
            data={mockChartData.requests}
            categories={mockChartData.categories}
            type="area"
            height={250}
          />
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800 md:p-6">
          <MetricsChart
            title="Error Rate (Last 12 Months)"
            data={mockChartData.errors}
            categories={mockChartData.categories}
            type="line"
            height={250}
          />
        </div>
      </div>

      {/* Resource Usage */}
      <div className="grid gap-4 grid-cols-1 md:grid-cols-3 md:gap-6">
        <SystemHealthWidget
          title="CPU Usage"
          value="45%"
          type="cpu"
          subtitle="Average load"
        />
        <SystemHealthWidget
          title="Memory Usage"
          value="62%"
          type="cpu"
          subtitle="8.2 GB / 16 GB"
        />
        <SystemHealthWidget
          title="Storage"
          value="38%"
          type="cpu"
          subtitle="38 GB / 100 GB"
        />
      </div>
    </div>
  )
}
