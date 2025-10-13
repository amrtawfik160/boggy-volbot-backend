import { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Admin Dashboard',
}

export default function AdminDashboardPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 md:text-3xl">
          Admin Dashboard
        </h1>
        <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
          System overview and health monitoring
        </p>
      </div>

      {/* Placeholder for System Health Dashboard Components */}
      <div className="grid gap-4 md:gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800 md:p-6">
          <h3 className="text-sm font-medium text-gray-600 dark:text-gray-400">
            Total Users
          </h3>
          <p className="mt-2 text-2xl font-bold text-gray-900 dark:text-gray-100 md:text-3xl">
            0
          </p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800 md:p-6">
          <h3 className="text-sm font-medium text-gray-600 dark:text-gray-400">
            Active Campaigns
          </h3>
          <p className="mt-2 text-2xl font-bold text-gray-900 dark:text-gray-100 md:text-3xl">
            0
          </p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800 md:p-6">
          <h3 className="text-sm font-medium text-gray-600 dark:text-gray-400">
            System Status
          </h3>
          <p className="mt-2 text-2xl font-bold text-green-600 dark:text-green-400">
            Online
          </p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800 md:p-6">
          <h3 className="text-sm font-medium text-gray-600 dark:text-gray-400">
            Alerts
          </h3>
          <p className="mt-2 text-2xl font-bold text-gray-900 dark:text-gray-100 md:text-3xl">
            0
          </p>
        </div>
      </div>

      <div className="text-center rounded-lg border border-gray-200 bg-white p-8 dark:border-gray-700 dark:bg-gray-800 md:p-12">
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Admin Dashboard components will be implemented in the next steps
        </p>
      </div>
    </div>
  )
}
