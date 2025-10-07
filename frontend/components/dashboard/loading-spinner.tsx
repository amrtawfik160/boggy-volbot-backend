import React from 'react'

export interface LoadingSpinnerProps {
  /**
   * Size of the spinner
   */
  size?: 'sm' | 'md' | 'lg'
  /**
   * Optional message to display
   */
  message?: string
  /**
   * Center in container
   */
  centered?: boolean
  /**
   * Custom className
   */
  className?: string
}

/**
 * LoadingSpinner - A reusable loading indicator
 *
 * Features:
 * - Configurable sizes
 * - Optional loading message
 * - Centered layout option
 * - Accessible with ARIA attributes
 */
export function LoadingSpinner({
  size = 'md',
  message,
  centered = false,
  className = '',
}: LoadingSpinnerProps) {
  const sizeClasses = {
    sm: 'h-4 w-4',
    md: 'h-8 w-8',
    lg: 'h-12 w-12',
  }

  const spinner = (
    <div
      className={`animate-spin rounded-full border-2 border-gray-300 border-t-indigo-600 ${sizeClasses[size]}`}
      role="status"
      aria-label="Loading"
    >
      <span className="sr-only">Loading...</span>
    </div>
  )

  if (centered) {
    return (
      <div className={`flex flex-col items-center justify-center py-8 sm:py-12 ${className}`}>
        {spinner}
        {message && (
          <p className="mt-3 text-sm text-gray-500">{message}</p>
        )}
      </div>
    )
  }

  return (
    <div className={`inline-flex items-center gap-3 ${className}`}>
      {spinner}
      {message && <span className="text-sm text-gray-500">{message}</span>}
    </div>
  )
}
