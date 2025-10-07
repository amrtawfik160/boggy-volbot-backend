import React from 'react'

export interface MetricCardProps {
  /**
   * The label for the metric (e.g., "Active Campaigns")
   */
  label: string
  /**
   * The value to display (can be string or number)
   */
  value: string | number
  /**
   * Optional subtitle or additional info below the value
   */
  subtitle?: string
  /**
   * Optional icon component to display
   */
  icon?: React.ReactNode
  /**
   * Optional custom className for styling
   */
  className?: string
  /**
   * Optional trend indicator (positive/negative/neutral)
   */
  trend?: {
    value: number
    label?: string
    isPositive?: boolean
  }
  /**
   * Whether the card is loading
   */
  isLoading?: boolean
  /**
   * Click handler for interactive cards
   */
  onClick?: () => void
}

/**
 * MetricCard - A reusable component for displaying dashboard metrics
 *
 * Mobile-first responsive design with proper typography scaling
 */
export function MetricCard({
  label,
  value,
  subtitle,
  icon,
  className = '',
  trend,
  isLoading = false,
  onClick,
}: MetricCardProps) {
  const baseClasses = 'overflow-hidden bg-white px-4 py-5 shadow border border-gray-200 transition-all'
  const interactiveClasses = onClick ? 'cursor-pointer hover:shadow-md hover:border-gray-300' : ''
  const responsiveClasses = 'sm:px-6'

  if (isLoading) {
    return (
      <div className={`${baseClasses} ${responsiveClasses} ${className} animate-pulse`}>
        <div className="h-4 bg-gray-200 rounded w-1/2 mb-3" />
        <div className="h-8 bg-gray-200 rounded w-3/4" />
      </div>
    )
  }

  return (
    <div
      className={`${baseClasses} ${interactiveClasses} ${responsiveClasses} ${className}`}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={
        onClick
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                onClick()
              }
            }
          : undefined
      }
    >
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <dt className="truncate text-sm font-medium text-gray-500 mb-1 sm:text-base">
            {label}
          </dt>
          <dd className="mt-1 text-2xl font-semibold text-gray-900 sm:text-3xl break-words">
            {value}
          </dd>
          {subtitle && (
            <dd className="mt-2 text-xs text-gray-500 sm:text-sm">{subtitle}</dd>
          )}
          {trend && (
            <dd className="mt-2 flex items-center text-xs sm:text-sm">
              <span
                className={`font-medium ${
                  trend.isPositive
                    ? 'text-green-600'
                    : trend.isPositive === false
                    ? 'text-red-600'
                    : 'text-gray-600'
                }`}
              >
                {trend.isPositive ? '↑' : trend.isPositive === false ? '↓' : '→'}{' '}
                {Math.abs(trend.value)}%
              </span>
              {trend.label && (
                <span className="ml-2 text-gray-500">{trend.label}</span>
              )}
            </dd>
          )}
        </div>
        {icon && (
          <div className="ml-4 flex-shrink-0 text-gray-400" aria-hidden="true">
            {icon}
          </div>
        )}
      </div>
    </div>
  )
}

/**
 * MetricCardGrid - Container for multiple metric cards with responsive grid
 */
export interface MetricCardGridProps {
  children: React.ReactNode
  className?: string
}

export function MetricCardGrid({ children, className = '' }: MetricCardGridProps) {
  return (
    <div
      className={`grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 ${className}`}
    >
      {children}
    </div>
  )
}
