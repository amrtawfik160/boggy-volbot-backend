import React from 'react'

export interface EmptyStateProps {
  /**
   * Icon to display (optional)
   */
  icon?: React.ReactNode
  /**
   * Title message
   */
  title: string
  /**
   * Description message
   */
  description?: string
  /**
   * Primary action button
   */
  action?: {
    label: string
    onClick: () => void
  }
  /**
   * Secondary action button (optional)
   */
  secondaryAction?: {
    label: string
    onClick: () => void
  }
  /**
   * Custom className
   */
  className?: string
}

/**
 * EmptyState - A reusable component for empty state displays
 *
 * Features:
 * - Optional icon display
 * - Primary and secondary actions
 * - Responsive text sizing
 * - Accessible button interactions
 */
export function EmptyState({
  icon,
  title,
  description,
  action,
  secondaryAction,
  className = '',
}: EmptyStateProps) {
  return (
    <div className={`text-center py-8 sm:py-12 ${className}`}>
      {icon && (
        <div className="mx-auto flex h-12 w-12 items-center justify-center sm:h-16 sm:w-16 text-gray-400 mb-4">
          {icon}
        </div>
      )}
      <h3 className="text-base sm:text-lg font-medium text-gray-900 mb-2">
        {title}
      </h3>
      {description && (
        <p className="text-sm text-gray-500 mb-6 max-w-md mx-auto px-4">
          {description}
        </p>
      )}
      {(action || secondaryAction) && (
        <div className="flex flex-col sm:flex-row gap-3 justify-center items-center px-4">
          {action && (
            <button
              onClick={action.onClick}
              className="w-full sm:w-auto inline-flex items-center justify-center px-4 py-2 text-sm font-semibold text-white shadow-sm bg-indigo-600 hover:bg-indigo-500 transition-colors"
            >
              {action.label}
            </button>
          )}
          {secondaryAction && (
            <button
              onClick={secondaryAction.onClick}
              className="w-full sm:w-auto inline-flex items-center justify-center px-4 py-2 text-sm font-semibold text-gray-700 bg-white shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50 transition-colors"
            >
              {secondaryAction.label}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
