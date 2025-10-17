import React from 'react'

/**
 * Campaign status types
 */
export type CampaignStatus = 'draft' | 'active' | 'paused' | 'stopped' | 'completed'

/**
 * Run status types
 */
export type RunStatus = 'running' | 'paused' | 'stopped' | 'completed' | 'failed'

/**
 * Generic status types (can be used for other entities)
 */
export type GenericStatus = string

export interface StatusBadgeProps {
  /**
   * The status value to display
   */
  status: CampaignStatus | RunStatus | GenericStatus
  /**
   * Optional custom label (if different from status)
   */
  label?: string
  /**
   * Size variant
   */
  size?: 'sm' | 'md' | 'lg'
  /**
   * Optional custom className
   */
  className?: string
  /**
   * Custom color mapping override
   */
  colorMap?: Record<string, string>
  /**
   * Show pulsing animation for active states
   */
  pulse?: boolean
}

/**
 * Default color mapping for campaign statuses
 */
const defaultCampaignColors: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-800 border-gray-200',
  active: 'bg-green-100 text-green-800 border-green-200',
  paused: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  stopped: 'bg-red-100 text-red-800 border-red-200',
  completed: 'bg-blue-100 text-blue-800 border-blue-200',
  running: 'bg-green-100 text-green-800 border-green-200',
  failed: 'bg-red-100 text-red-800 border-red-200',
}

/**
 * StatusBadge - A reusable component for displaying status indicators
 *
 * Features:
 * - Type-safe status values
 * - Configurable sizes (sm/md/lg)
 * - Custom color mapping support
 * - Optional pulse animation for active states
 * - Accessible with proper ARIA attributes
 * - Mobile-first responsive design
 */
export function StatusBadge({
  status,
  label,
  size = 'md',
  className = '',
  colorMap,
  pulse = false,
}: StatusBadgeProps) {
  // Use custom color map or default
  const colors = colorMap || defaultCampaignColors
  const colorClass = colors[status.toLowerCase()] || colors.draft

  // Size classes
  const sizeClasses = {
    sm: 'px-2 py-0.5 text-xs',
    md: 'px-2 py-1 text-xs sm:text-sm',
    lg: 'px-3 py-1.5 text-sm sm:text-base',
  }

  // Display label (capitalize first letter if no custom label)
  const displayLabel =
    label || status.charAt(0).toUpperCase() + status.slice(1).toLowerCase()

  // Pulse animation for active states
  const pulseClass =
    pulse && (status === 'active' || status === 'running') ? 'animate-pulse' : ''

  return (
    <span
      className={`
        inline-flex items-center font-medium border
        ${colorClass}
        ${sizeClasses[size]}
        ${pulseClass}
        ${className}
      `.trim()}
      role="status"
      aria-label={`Status: ${displayLabel}`}
    >
      {pulse && (status === 'active' || status === 'running') && (
        <span className="mr-1.5 h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" />
      )}
      {displayLabel}
    </span>
  )
}

/**
 * StatusBadgeGroup - Container for multiple status badges
 */
export interface StatusBadgeGroupProps {
  children: React.ReactNode
  className?: string
}

export function StatusBadgeGroup({ children, className = '' }: StatusBadgeGroupProps) {
  return (
    <div className={`flex flex-wrap items-center gap-2 ${className}`}>
      {children}
    </div>
  )
}
