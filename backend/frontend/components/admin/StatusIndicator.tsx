'use client'

import { RiCheckboxCircleLine, RiErrorWarningLine, RiCloseCircleLine } from '@remixicon/react'

export type StatusType = 'online' | 'warning' | 'offline'

interface StatusIndicatorProps {
  status: StatusType
  label?: string
  showIcon?: boolean
}

export default function StatusIndicator({ status, label, showIcon = true }: StatusIndicatorProps) {
  const statusConfig = {
    online: {
      color: 'text-green-600 dark:text-green-400',
      bgColor: 'bg-green-100 dark:bg-green-900/20',
      icon: RiCheckboxCircleLine,
      text: 'Online',
    },
    warning: {
      color: 'text-yellow-600 dark:text-yellow-400',
      bgColor: 'bg-yellow-100 dark:bg-yellow-900/20',
      icon: RiErrorWarningLine,
      text: 'Warning',
    },
    offline: {
      color: 'text-red-600 dark:text-red-400',
      bgColor: 'bg-red-100 dark:bg-red-900/20',
      icon: RiCloseCircleLine,
      text: 'Offline',
    },
  }

  const config = statusConfig[status]
  const Icon = config.icon

  return (
    <div className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm font-medium ${config.bgColor} ${config.color}`}>
      {showIcon && <Icon className="h-4 w-4" />}
      <span>{label || config.text}</span>
    </div>
  )
}
