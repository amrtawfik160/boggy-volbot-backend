import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import StatusIndicator, { StatusType } from './StatusIndicator'

describe('StatusIndicator', () => {
  describe('Rendering', () => {
    it('renders with online status', () => {
      render(<StatusIndicator status="online" />)
      expect(screen.getByText('Online')).toBeInTheDocument()
    })

    it('renders with warning status', () => {
      render(<StatusIndicator status="warning" />)
      expect(screen.getByText('Warning')).toBeInTheDocument()
    })

    it('renders with offline status', () => {
      render(<StatusIndicator status="offline" />)
      expect(screen.getByText('Offline')).toBeInTheDocument()
    })

    it('renders with custom label', () => {
      render(<StatusIndicator status="online" label="System Active" />)
      expect(screen.getByText('System Active')).toBeInTheDocument()
      expect(screen.queryByText('Online')).not.toBeInTheDocument()
    })

    it('renders without icon when showIcon is false', () => {
      const { container } = render(<StatusIndicator status="online" showIcon={false} />)
      const svg = container.querySelector('svg')
      expect(svg).not.toBeInTheDocument()
    })

    it('renders with icon by default', () => {
      const { container } = render(<StatusIndicator status="online" />)
      const svg = container.querySelector('svg')
      expect(svg).toBeInTheDocument()
    })
  })

  describe('Status Styling', () => {
    it('applies correct classes for online status', () => {
      const { container } = render(<StatusIndicator status="online" />)
      const statusDiv = container.querySelector('div')
      expect(statusDiv).toHaveClass('bg-green-100', 'text-green-600')
    })

    it('applies correct classes for warning status', () => {
      const { container } = render(<StatusIndicator status="warning" />)
      const statusDiv = container.querySelector('div')
      expect(statusDiv).toHaveClass('bg-yellow-100', 'text-yellow-600')
    })

    it('applies correct classes for offline status', () => {
      const { container } = render(<StatusIndicator status="offline" />)
      const statusDiv = container.querySelector('div')
      expect(statusDiv).toHaveClass('bg-red-100', 'text-red-600')
    })
  })

  describe('Edge Cases', () => {
    it('handles all status types correctly', () => {
      const statuses: StatusType[] = ['online', 'warning', 'offline']
      statuses.forEach((status) => {
        const { unmount } = render(<StatusIndicator status={status} />)
        expect(screen.getByText(status.charAt(0).toUpperCase() + status.slice(1))).toBeInTheDocument()
        unmount()
      })
    })
  })
})
