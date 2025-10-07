'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { User } from '@supabase/supabase-js'

const navigation = [
  { name: 'Dashboard', href: '/dashboard', icon: '📊' },
  { name: 'Campaigns', href: '/campaigns', icon: '🎯' },
  { name: 'Wallets', href: '/wallets', icon: '👛' },
  { name: 'Tokens', href: '/tokens', icon: '🪙' },
  { name: 'Settings', href: '/settings', icon: '⚙️' },
]

export default function DashboardNav({ user }: { user: User }) {
  const pathname = usePathname()

  return (
    <div className="flex w-64 flex-col bg-white border-r border-gray-200">
      <div className="flex h-16 items-center justify-center border-b border-gray-200">
        <h1 className="text-xl font-bold text-gray-900">Solana Volume Bot</h1>
      </div>
      <nav className="flex-1 space-y-1 px-2 py-4">
        {navigation.map((item) => {
          const isActive = pathname === item.href
          return (
            <Link
              key={item.name}
              href={item.href}
              className={`group flex items-center px-3 py-2 text-sm font-medium rounded-md ${
                isActive
                  ? 'bg-indigo-50 text-indigo-600'
                  : 'text-gray-700 hover:bg-gray-50 hover:text-gray-900'
              }`}
            >
              <span className="mr-3 text-lg">{item.icon}</span>
              {item.name}
            </Link>
          )
        })}
      </nav>
      <div className="border-t border-gray-200 p-4">
        <div className="flex items-center">
          <div className="flex-1">
            <p className="text-sm font-medium text-gray-900">{user.email}</p>
            <p className="text-xs text-gray-500">Account Settings</p>
          </div>
        </div>
      </div>
    </div>
  )
}

