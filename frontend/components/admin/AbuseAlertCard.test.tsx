import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import AbuseAlertCard, { AlertSeverity } from './AbuseAlertCard'

describe('AbuseAlertCard', () => {
  const mockProps = {
    id: 'alert-123',
    title: 'Suspicious Activity Detected',
    description: 'Multiple failed login attempts from same IP',
    severity: 'high' as AlertSeverity,
    user: 'user@example.com',
    campaign: 'Campaign #42',
    timestamp: '2 hours ago',
  }

  describe('Rendering', () => {
    it('renders alert with all props', () => {
      render(<AbuseAlertCard {...mockProps} />)
      expect(screen.getByText('Suspicious Activity Detected')).toBeInTheDocument()
      expect(screen.getByText('Multiple failed login attempts from same IP')).toBeInTheDocument()
      expect(screen.getByText('2 hours ago')).toBeInTheDocument()
    })

    it('renders user information when provided', () => {
      render(<AbuseAlertCard {...mockProps} />)
      expect(screen.getByText('User: user@example.com')).toBeInTheDocument()
    })

    it('renders campaign information when provided', () => {
      render(<AbuseAlertCard {...mockProps} />)
      expect(screen.getByText('Campaign: Campaign #42')).toBeInTheDocument()
    })

    it('renders without user information', () => {
      render(<AbuseAlertCard {...mockProps} user={undefined} />)
      expect(screen.queryByText(/User:/)).not.toBeInTheDocument()
    })

    it('renders without campaign information', () => {
      render(<AbuseAlertCard {...mockProps} campaign={undefined} />)
      expect(screen.queryByText(/Campaign:/)).not.toBeInTheDocument()
    })
  })

  describe('Severity Levels', () => {
    const severities: AlertSeverity[] = ['low', 'medium', 'high', 'critical']
    const expectedLabels = ['Low Priority', 'Medium Priority', 'High Priority', 'Critical Priority']

    severities.forEach((severity, index) => {
      it(`renders ${severity} severity correctly`, () => {
        render(<AbuseAlertCard {...mockProps} severity={severity} />)
        expect(screen.getByText(expectedLabels[index])).toBeInTheDocument()
      })
    })

    it('applies correct styling for low severity', () => {
      const { container } = render(<AbuseAlertCard {...mockProps} severity="low" />)
      const card = container.querySelector('div')
      expect(card).toHaveClass('bg-blue-50', 'border-blue-200')
    })

    it('applies correct styling for critical severity', () => {
      const { container } = render(<AbuseAlertCard {...mockProps} severity="critical" />)
      const card = container.querySelector('div')
      expect(card).toHaveClass('bg-red-50', 'border-red-200')
    })
  })

  describe('Action Buttons', () => {
    it('renders View Details button when onView is provided', () => {
      const onView = vi.fn()
      render(<AbuseAlertCard {...mockProps} onView={onView} />)
      expect(screen.getByText('View Details')).toBeInTheDocument()
    })

    it('does not render View Details button when onView is not provided', () => {
      render(<AbuseAlertCard {...mockProps} />)
      expect(screen.queryByText('View Details')).not.toBeInTheDocument()
    })

    it('calls onView with correct id when View Details is clicked', () => {
      const onView = vi.fn()
      render(<AbuseAlertCard {...mockProps} onView={onView} />)
      fireEvent.click(screen.getByText('View Details'))
      expect(onView).toHaveBeenCalledWith('alert-123')
      expect(onView).toHaveBeenCalledTimes(1)
    })

    it('renders Dismiss button when onDismiss is provided', () => {
      const onDismiss = vi.fn()
      render(<AbuseAlertCard {...mockProps} onDismiss={onDismiss} />)
      expect(screen.getByText('Dismiss')).toBeInTheDocument()
    })

    it('does not render Dismiss button when onDismiss is not provided', () => {
      render(<AbuseAlertCard {...mockProps} />)
      expect(screen.queryByText('Dismiss')).not.toBeInTheDocument()
    })

    it('calls onDismiss with correct id when Dismiss is clicked', () => {
      const onDismiss = vi.fn()
      render(<AbuseAlertCard {...mockProps} onDismiss={onDismiss} />)
      fireEvent.click(screen.getByText('Dismiss'))
      expect(onDismiss).toHaveBeenCalledWith('alert-123')
      expect(onDismiss).toHaveBeenCalledTimes(1)
    })

    it('renders both buttons when both callbacks are provided', () => {
      const onView = vi.fn()
      const onDismiss = vi.fn()
      render(<AbuseAlertCard {...mockProps} onView={onView} onDismiss={onDismiss} />)
      expect(screen.getByText('View Details')).toBeInTheDocument()
      expect(screen.getByText('Dismiss')).toBeInTheDocument()
    })
  })

  describe('Icon Rendering', () => {
    it('renders icon for each severity level', () => {
      const severities: AlertSeverity[] = ['low', 'medium', 'high', 'critical']
      severities.forEach((severity) => {
        const { container, unmount } = render(<AbuseAlertCard {...mockProps} severity={severity} />)
        const icon = container.querySelector('svg')
        expect(icon).toBeInTheDocument()
        unmount()
      })
    })
  })

  describe('Edge Cases', () => {
    it('handles long titles gracefully', () => {
      const longTitle = 'A'.repeat(200)
      render(<AbuseAlertCard {...mockProps} title={longTitle} />)
      expect(screen.getByText(longTitle)).toBeInTheDocument()
    })

    it('handles long descriptions gracefully', () => {
      const longDescription = 'B'.repeat(500)
      render(<AbuseAlertCard {...mockProps} description={longDescription} />)
      expect(screen.getByText(longDescription)).toBeInTheDocument()
    })
  })
})
