import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import AdminHeader from './AdminHeader'
import { User } from '@supabase/supabase-js'

describe('AdminHeader', () => {
  const mockUser: User = {
    id: 'user-123',
    email: 'admin@example.com',
    app_metadata: {},
    user_metadata: {},
    aud: 'authenticated',
    created_at: new Date().toISOString(),
  }

  const mockPush = vi.fn()
  const mockRefresh = vi.fn()
  const mockSetTheme = vi.fn()
  const mockSignOut = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    mockSignOut.mockResolvedValue({ error: null })
  })

  describe('Rendering', () => {
    it('renders admin header with title', () => {
      render(<AdminHeader user={mockUser} />)
      expect(screen.getByText('System Administration')).toBeInTheDocument()
    })

    it('renders theme toggle button', () => {
      render(<AdminHeader user={mockUser} />)
      const themeButton = screen.getByLabelText('Toggle theme')
      expect(themeButton).toBeInTheDocument()
    })

    it('renders sign out button', () => {
      render(<AdminHeader user={mockUser} />)
      expect(screen.getByText('Sign Out')).toBeInTheDocument()
    })

    it('renders header as semantic header element', () => {
      const { container } = render(<AdminHeader user={mockUser} />)
      const header = container.querySelector('header')
      expect(header).toBeInTheDocument()
    })
  })

  describe('Theme Toggle', () => {
    it('shows theme toggle button', () => {
      const { container } = render(<AdminHeader user={mockUser} />)
      const themeButton = screen.getByLabelText('Toggle theme')
      expect(themeButton).toBeInTheDocument()
      // Icon should be present
      expect(container.querySelector('svg')).toBeInTheDocument()
    })

    it('theme toggle button is clickable', () => {
      render(<AdminHeader user={mockUser} />)
      const themeButton = screen.getByLabelText('Toggle theme')
      fireEvent.click(themeButton)
      // Button should not throw error when clicked
      expect(themeButton).toBeInTheDocument()
    })
  })

  describe('Sign Out Functionality', () => {
    it('sign out button is clickable', async () => {
      render(<AdminHeader user={mockUser} />)
      const signOutButton = screen.getByText('Sign Out')
      fireEvent.click(signOutButton)

      // Button should exist and be clickable
      expect(signOutButton).toBeInTheDocument()
    })
  })

  describe('Responsive Behavior', () => {
    it('renders sign out text that is hidden on mobile', () => {
      render(<AdminHeader user={mockUser} />)
      const signOutText = screen.getByText('Sign Out')
      expect(signOutText).toHaveClass('hidden', 'md:inline')
    })

    it('renders sign out icon visible on all screen sizes', () => {
      const { container } = render(<AdminHeader user={mockUser} />)
      const signOutButton = screen.getByText('Sign Out').closest('button')
      const icon = signOutButton?.querySelector('svg')
      expect(icon).toBeInTheDocument()
    })
  })

  describe('User Prop', () => {
    it('accepts user prop without errors', () => {
      expect(() => render(<AdminHeader user={mockUser} />)).not.toThrow()
    })

    it('renders with different user data', () => {
      const differentUser: User = {
        ...mockUser,
        id: 'different-id',
        email: 'different@example.com',
      }
      expect(() => render(<AdminHeader user={differentUser} />)).not.toThrow()
    })
  })

  describe('Accessibility', () => {
    it('has accessible theme toggle button', () => {
      render(<AdminHeader user={mockUser} />)
      const themeButton = screen.getByLabelText('Toggle theme')
      expect(themeButton).toHaveAttribute('aria-label', 'Toggle theme')
    })

    it('theme button is keyboard accessible', () => {
      render(<AdminHeader user={mockUser} />)
      const themeButton = screen.getByLabelText('Toggle theme')
      expect(themeButton.tagName).toBe('BUTTON')
    })

    it('sign out button is keyboard accessible', () => {
      render(<AdminHeader user={mockUser} />)
      const signOutButton = screen.getByText('Sign Out').closest('button')
      expect(signOutButton?.tagName).toBe('BUTTON')
    })
  })
})
