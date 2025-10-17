'use client'

import { RiAlertLine, RiErrorWarningLine, RiInformationLine } from '@remixicon/react'

export type AlertSeverity = 'low' | 'medium' | 'high' | 'critical'

interface AbuseAlertCardProps {
  id: string
  title: string
  description: string
  severity: AlertSeverity
  user?: string
  campaign?: string
  timestamp: string
  onView?: (id: string) => void
  onDismiss?: (id: string) => void
}

const severityConfig = {
  low: {
    color: 'text-blue-700 dark:text-blue-400',
    bgColor: 'bg-blue-50 dark:bg-blue-900/20',
    borderColor: 'border-blue-200 dark:border-blue-800',
    icon: RiInformationLine,
    label: 'Low',
  },
  medium: {
    color: 'text-yellow-700 dark:text-yellow-400',
    bgColor: 'bg-yellow-50 dark:bg-yellow-900/20',
    borderColor: 'border-yellow-200 dark:border-yellow-800',
    icon: RiErrorWarningLine,
    label: 'Medium',
  },
  high: {
    color: 'text-orange-700 dark:text-orange-400',
    bgColor: 'bg-orange-50 dark:bg-orange-900/20',
    borderColor: 'border-orange-200 dark:border-orange-800',
    icon: RiAlertLine,
    label: 'High',
  },
  critical: {
    color: 'text-red-700 dark:text-red-400',
    bgColor: 'bg-red-50 dark:bg-red-900/20',
    borderColor: 'border-red-200 dark:border-red-800',
    icon: RiAlertLine,
    label: 'Critical',
  },
}

export default function AbuseAlertCard({
  id,
  title,
  description,
  severity,
  user,
  campaign,
  timestamp,
  onView,
  onDismiss,
}: AbuseAlertCardProps) {
  const config = severityConfig[severity]
  const Icon = config.icon

  return (
    <div
      className={`rounded-lg border p-4 transition-all hover:shadow-md ${config.bgColor} ${config.borderColor}`}
    >
      <div className="flex items-start gap-3">
        <div className={`rounded-lg p-2 ${config.bgColor}`}>
          <Icon className={`h-5 w-5 ${config.color}`} />
        </div>
        <div className="flex-1 space-y-2">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h3 className="font-semibold text-gray-900 dark:text-gray-100">{title}</h3>
              <span
                className={`mt-1 inline-block rounded-full px-2 py-0.5 text-xs font-medium ${config.bgColor} ${config.color}`}
              >
                {config.label} Priority
              </span>
            </div>
            <span className="text-xs text-gray-500 dark:text-gray-400">{timestamp}</span>
          </div>
          <p className="text-sm text-gray-700 dark:text-gray-300">{description}</p>
          <div className="flex flex-wrap gap-2 text-xs text-gray-600 dark:text-gray-400">
            {user && (
              <span className="rounded bg-white px-2 py-1 dark:bg-gray-800">
                User: {user}
              </span>
            )}
            {campaign && (
              <span className="rounded bg-white px-2 py-1 dark:bg-gray-800">
                Campaign: {campaign}
              </span>
            )}
          </div>
          <div className="flex gap-2 pt-2">
            {onView && (
              <button
                onClick={() => onView(id)}
                className="rounded bg-white px-3 py-1.5 text-sm font-medium text-gray-700 transition hover:bg-gray-100 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
              >
                View Details
              </button>
            )}
            {onDismiss && (
              <button
                onClick={() => onDismiss(id)}
                className="rounded px-3 py-1.5 text-sm font-medium text-gray-600 transition hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200"
              >
                Dismiss
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
