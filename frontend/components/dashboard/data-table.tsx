import React from 'react'

export interface Column<T> {
  /**
   * Unique key for the column
   */
  key: string
  /**
   * Column header label
   */
  header: string
  /**
   * Render function for cell content
   */
  render: (row: T, index: number) => React.ReactNode
  /**
   * Optional column width class
   */
  width?: string
  /**
   * Text alignment
   */
  align?: 'left' | 'center' | 'right'
  /**
   * Hide column on mobile
   */
  hideOnMobile?: boolean
  /**
   * Sort function (optional)
   */
  sortable?: boolean
  sortFn?: (a: T, b: T) => number
}

export interface DataTableProps<T> {
  /**
   * Array of data rows
   */
  data: T[]
  /**
   * Column definitions
   */
  columns: Column<T>[]
  /**
   * Optional key extractor (defaults to using index)
   */
  keyExtractor?: (row: T, index: number) => string | number
  /**
   * Empty state message
   */
  emptyMessage?: string
  /**
   * Empty state action
   */
  emptyAction?: {
    label: string
    onClick: () => void
  }
  /**
   * Loading state
   */
  isLoading?: boolean
  /**
   * Row click handler
   */
  onRowClick?: (row: T, index: number) => void
  /**
   * Optional custom className
   */
  className?: string
  /**
   * Enable hover effect on rows
   */
  hoverEffect?: boolean
  /**
   * Compact mode (smaller padding)
   */
  compact?: boolean
}

/**
 * DataTable - A reusable, type-safe table component
 *
 * Features:
 * - Fully generic/type-safe
 * - Mobile-responsive with column hiding
 * - Loading and empty states
 * - Row click handlers
 * - Accessible with proper ARIA attributes
 * - Customizable styling
 */
export function DataTable<T>({
  data,
  columns,
  keyExtractor = (_, index) => index,
  emptyMessage = 'No data available',
  emptyAction,
  isLoading = false,
  onRowClick,
  className = '',
  hoverEffect = true,
  compact = false,
}: DataTableProps<T>) {
  const paddingClass = compact ? 'px-3 py-3' : 'px-3 py-4 sm:px-4'

  // Loading state
  if (isLoading) {
    return (
      <div className={`overflow-x-auto ${className}`}>
        <div className="min-w-full animate-pulse">
          <div className="h-12 bg-gray-100 mb-2" />
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-16 bg-gray-50 mb-1" />
          ))}
        </div>
      </div>
    )
  }

  // Empty state
  if (data.length === 0) {
    return (
      <div className="text-center py-8 sm:py-12">
        <p className="text-sm text-gray-500 mb-4">{emptyMessage}</p>
        {emptyAction && (
          <button
            onClick={emptyAction.onClick}
            className="inline-flex items-center px-4 py-2 text-sm font-semibold text-white shadow-sm bg-indigo-600 hover:bg-indigo-500 transition-colors"
          >
            {emptyAction.label}
          </button>
        )}
      </div>
    )
  }

  return (
    <div className={`overflow-x-auto ${className}`}>
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            {columns.map((column) => {
              const alignClass =
                column.align === 'center'
                  ? 'text-center'
                  : column.align === 'right'
                  ? 'text-right'
                  : 'text-left'

              const mobileClass = column.hideOnMobile ? 'hidden sm:table-cell' : ''

              return (
                <th
                  key={column.key}
                  scope="col"
                  className={`
                    px-3 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider
                    ${alignClass}
                    ${mobileClass}
                    ${column.width || ''}
                  `.trim()}
                >
                  {column.header}
                </th>
              )
            })}
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {data.map((row, index) => {
            const key = keyExtractor(row, index)
            const isClickable = !!onRowClick
            const clickableClass = isClickable ? 'cursor-pointer' : ''
            const hoverClass = hoverEffect ? 'hover:bg-gray-50' : ''

            return (
              <tr
                key={key}
                onClick={isClickable ? () => onRowClick(row, index) : undefined}
                className={`
                  transition-colors
                  ${clickableClass}
                  ${hoverClass}
                `.trim()}
                role={isClickable ? 'button' : undefined}
                tabIndex={isClickable ? 0 : undefined}
                onKeyDown={
                  isClickable
                    ? (e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          onRowClick(row, index)
                        }
                      }
                    : undefined
                }
              >
                {columns.map((column) => {
                  const alignClass =
                    column.align === 'center'
                      ? 'text-center'
                      : column.align === 'right'
                      ? 'text-right'
                      : 'text-left'

                  const mobileClass = column.hideOnMobile ? 'hidden sm:table-cell' : ''

                  return (
                    <td
                      key={column.key}
                      className={`
                        ${paddingClass}
                        whitespace-nowrap text-sm
                        ${alignClass}
                        ${mobileClass}
                      `.trim()}
                    >
                      {column.render(row, index)}
                    </td>
                  )
                })}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

/**
 * DataTableContainer - Wrapper with card styling
 */
export interface DataTableContainerProps {
  children: React.ReactNode
  title?: string
  action?: {
    label: string
    onClick: () => void
  }
  className?: string
}

export function DataTableContainer({
  children,
  title,
  action,
  className = '',
}: DataTableContainerProps) {
  return (
    <div className={`bg-white shadow border border-gray-200 ${className}`}>
      {(title || action) && (
        <div className="px-4 py-4 sm:px-6 border-b border-gray-200 flex items-center justify-between">
          {title && (
            <h3 className="text-base sm:text-lg font-medium leading-6 text-gray-900">
              {title}
            </h3>
          )}
          {action && (
            <button
              onClick={action.onClick}
              className="text-sm font-semibold text-indigo-600 hover:text-indigo-900 transition-colors"
            >
              {action.label}
            </button>
          )}
        </div>
      )}
      <div className="px-4 py-5 sm:p-6">{children}</div>
    </div>
  )
}
