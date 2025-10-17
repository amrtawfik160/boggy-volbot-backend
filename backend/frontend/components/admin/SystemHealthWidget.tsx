'use client'

import { ReactNode } from 'react'
import {
  RiServerLine,
  RiUserLine,
  RiCampaignLine,
  RiAlertLine,
  RiTimeLine,
  RiCpuLine,
} from '@remixicon/react'

interface SystemHealthWidgetProps {
  title: string
  value: string | number
  subtitle?: string
  type?: 'users' | 'campaigns' | 'alerts' | 'uptime' | 'api' | 'cpu'
  trend?: {
    value: number
    isPositive: boolean
  }
}

const iconMap = {
  users: RiUserLine,
  campaigns: RiCampaignLine,
  alerts: RiAlertLine,
  uptime: RiTimeLine,
  api: RiServerLine,
  cpu: RiCpuLine,
}

const colorMap = {
  users: 'text-blue-600 dark:text-blue-400 bg-blue-100 dark:bg-blue-900/20',
  campaigns: 'text-purple-600 dark:text-purple-400 bg-purple-100 dark:bg-purple-900/20',
  alerts: 'text-red-600 dark:text-red-400 bg-red-100 dark:bg-red-900/20',
  uptime: 'text-green-600 dark:text-green-400 bg-green-100 dark:bg-green-900/20',
  api: 'text-indigo-600 dark:text-indigo-400 bg-indigo-100 dark:bg-indigo-900/20',
  cpu: 'text-orange-600 dark:text-orange-400 bg-orange-100 dark:bg-orange-900/20',
}

export default function SystemHealthWidget({
  title,
  value,
  subtitle,
  type = 'api',
  trend,
}: SystemHealthWidgetProps) {
  const Icon = iconMap[type]
  const colorClass = colorMap[type]

  return (
    <div className="group relative overflow-hidden rounded-lg border border-gray-200 bg-white p-4 transition-all hover:shadow-md dark:border-gray-700 dark:bg-gray-800 md:p-6">
      {/* Icon */}
      <div className={`mb-4 inline-flex rounded-lg p-3 ${colorClass}`}>
        <Icon className="h-6 w-6" />
      </div>

      {/* Content */}
      <div className="space-y-1">
        <h3 className="text-sm font-medium text-gray-600 dark:text-gray-400">{title}</h3>
        <div className="flex items-baseline gap-2">
          <p className="text-2xl font-bold text-gray-900 dark:text-gray-100 md:text-3xl">
            {value}
          </p>
          {trend && (
            <span
              className={`text-sm font-medium ${
                trend.isPositive
                  ? 'text-green-600 dark:text-green-400'
                  : 'text-red-600 dark:text-red-400'
              }`}
            >
              {trend.isPositive ? '+' : ''}
              {trend.value}%
            </span>
          )}
        </div>
        {subtitle && (
          <p className="text-xs text-gray-500 dark:text-gray-400">{subtitle}</p>
        )}
      </div>

      {/* Hover effect */}
      <div className="absolute inset-x-0 bottom-0 h-1 bg-gradient-to-r from-blue-500 to-purple-500 opacity-0 transition-opacity group-hover:opacity-100" />
    </div>
  )
}
