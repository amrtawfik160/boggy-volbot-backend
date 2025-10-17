import { Metadata } from 'next'
import SystemHealthWidget from '@/components/admin/SystemHealthWidget'

export const metadata: Metadata = {
  title: 'Users Overview',
}

// Mock data - will be replaced with real API calls in task 13.5
const mockUsers = [
  { id: '1', email: 'user1@example.com', role: 'user', campaigns: 3, status: 'active', createdAt: '2024-01-15' },
  { id: '2', email: 'user2@example.com', role: 'user', campaigns: 1, status: 'active', createdAt: '2024-02-20' },
  { id: '3', email: 'user3@example.com', role: 'user', campaigns: 5, status: 'suspended', createdAt: '2024-03-10' },
]

export default function UsersPage() {
  return (
    <div className="space-y-4 md:space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 md:text-3xl">
          User Management
        </h1>
        <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
          Monitor and manage user accounts
        </p>
      </div>

      {/* Quick Stats */}
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 md:gap-6">
        <SystemHealthWidget
          title="Total Users"
          value="0"
          type="users"
          subtitle="All registered"
        />
        <SystemHealthWidget
          title="Active Users"
          value="0"
          type="users"
          subtitle="Last 30 days"
        />
        <SystemHealthWidget
          title="Suspended"
          value="0"
          type="alerts"
          subtitle="Restricted accounts"
        />
        <SystemHealthWidget
          title="New This Month"
          value="0"
          type="users"
          subtitle="Recent signups"
          trend={{ value: 12, isPositive: true }}
        />
      </div>

      {/* Users Table */}
      <div className="rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
        <div className="border-b border-gray-200 p-4 dark:border-gray-700 md:p-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            All Users
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-gray-800">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400 md:px-6">
                  Email
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400 md:px-6">
                  Role
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400 md:px-6">
                  Campaigns
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400 md:px-6">
                  Status
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400 md:px-6">
                  Joined
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400 md:px-6">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-white dark:divide-gray-700 dark:bg-gray-800">
              {mockUsers.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-sm text-gray-500 dark:text-gray-400 md:px-6">
                    No users found
                  </td>
                </tr>
              ) : (
                mockUsers.map((user) => (
                  <tr key={user.id} className="transition hover:bg-gray-50 dark:hover:bg-gray-700/50">
                    <td className="whitespace-nowrap px-4 py-4 text-sm text-gray-900 dark:text-gray-100 md:px-6">
                      {user.email}
                    </td>
                    <td className="whitespace-nowrap px-4 py-4 text-sm text-gray-500 dark:text-gray-400 md:px-6">
                      {user.role}
                    </td>
                    <td className="whitespace-nowrap px-4 py-4 text-sm text-gray-500 dark:text-gray-400 md:px-6">
                      {user.campaigns}
                    </td>
                    <td className="whitespace-nowrap px-4 py-4 md:px-6">
                      <span
                        className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${
                          user.status === 'active'
                            ? 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400'
                            : 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400'
                        }`}
                      >
                        {user.status}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-4 text-sm text-gray-500 dark:text-gray-400 md:px-6">
                      {user.createdAt}
                    </td>
                    <td className="whitespace-nowrap px-4 py-4 text-sm md:px-6">
                      <button className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300">
                        View
                      </button>
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
