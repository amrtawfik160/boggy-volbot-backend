'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { User } from '@supabase/supabase-js'
import {
  RiDashboardLine,
  RiUserLine,
  RiAlertLine,
  RiSettings4Line,
  RiFileListLine,
} from '@remixicon/react'

const navigation = [
  { name: 'Dashboard', href: '/admin-dashboard', icon: RiDashboardLine },
  { name: 'Users', href: '/admin-dashboard/users', icon: RiUserLine },
  { name: 'Campaigns', href: '/admin-dashboard/campaigns', icon: RiFileListLine },
  { name: 'Abuse Alerts', href: '/admin-dashboard/alerts', icon: RiAlertLine },
  { name: 'System', href: '/admin-dashboard/system', icon: RiSettings4Line },
]

export default function AdminNav({ user }: { user: User }) {
  const pathname = usePathname()

  return (
    <div className="flex w-64 flex-col border-r border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
      <div className="flex h-16 items-center justify-center border-b border-gray-200 dark:border-gray-700">
        <h1 className="text-xl font-bold text-red-600 dark:text-red-500">
          Admin Panel
        </h1>
      </div>
      <nav className="flex-1 space-y-1 px-2 py-4">
        {navigation.map((item) => {
          const isActive = pathname === item.href
          const Icon = item.icon
          return (
            <Link
              key={item.name}
              href={item.href}
              className={`group flex items-center rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-400'
                  : 'text-gray-700 hover:bg-gray-50 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-gray-700 dark:hover:text-gray-100'
              }`}
            >
              <Icon className="mr-3 h-5 w-5" />
              {item.name}
            </Link>
          )
        })}
      </nav>
      <div className="border-t border-gray-200 p-4 dark:border-gray-700">
        <div className="flex items-center">
          <div className="flex-1">
            <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
              {user.email}
            </p>
            <p className="text-xs text-red-600 dark:text-red-400">Admin</p>
          </div>
        </div>
      </div>
    </div>
  )
}
