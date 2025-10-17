import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StatusBadge, StatusBadgeGroup } from './status-badge';

describe('StatusBadge', () => {
  it('renders status with default styling', () => {
    render(<StatusBadge status="active" />);

    const badge = screen.getByRole('status');
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveTextContent('Active');
  });

  it('capitalizes status text correctly', () => {
    render(<StatusBadge status="draft" />);

    expect(screen.getByText('Draft')).toBeInTheDocument();
  });

  it('uses custom label when provided', () => {
    render(<StatusBadge status="active" label="Currently Running" />);

    expect(screen.getByText('Currently Running')).toBeInTheDocument();
  });

  it('applies correct colors for each status', () => {
    const { rerender } = render(<StatusBadge status="active" />);
    expect(screen.getByRole('status').className).toContain('bg-green-100');

    rerender(<StatusBadge status="draft" />);
    expect(screen.getByRole('status').className).toContain('bg-gray-100');

    rerender(<StatusBadge status="paused" />);
    expect(screen.getByRole('status').className).toContain('bg-yellow-100');

    rerender(<StatusBadge status="stopped" />);
    expect(screen.getByRole('status').className).toContain('bg-red-100');

    rerender(<StatusBadge status="completed" />);
    expect(screen.getByRole('status').className).toContain('bg-blue-100');
  });

  it('renders different sizes correctly', () => {
    const { rerender } = render(<StatusBadge status="active" size="sm" />);
    let badge = screen.getByRole('status');
    expect(badge.className).toContain('text-xs');

    rerender(<StatusBadge status="active" size="md" />);
    badge = screen.getByRole('status');
    expect(badge.className).toContain('text-xs');

    rerender(<StatusBadge status="active" size="lg" />);
    badge = screen.getByRole('status');
    expect(badge.className).toContain('text-sm');
  });

  it('shows pulse animation for active status when pulse prop is true', () => {
    render(<StatusBadge status="active" pulse={true} />);

    const badge = screen.getByRole('status');
    expect(badge.className).toContain('animate-pulse');
  });

  it('shows pulse animation for running status when pulse prop is true', () => {
    render(<StatusBadge status="running" pulse={true} />);

    const badge = screen.getByRole('status');
    expect(badge.className).toContain('animate-pulse');
  });

  it('does not show pulse animation when pulse is false', () => {
    render(<StatusBadge status="active" pulse={false} />);

    const badge = screen.getByRole('status');
    expect(badge.className).not.toContain('animate-pulse');
  });

  it('uses custom color map when provided', () => {
    const customColors = {
      active: 'bg-purple-100 text-purple-800 border-purple-200',
    };

    render(<StatusBadge status="active" colorMap={customColors} />);

    const badge = screen.getByRole('status');
    expect(badge.className).toContain('bg-purple-100');
  });

  it('falls back to draft color for unknown status', () => {
    render(<StatusBadge status="unknown-status" />);

    const badge = screen.getByRole('status');
    expect(badge.className).toContain('bg-gray-100');
  });

  it('applies custom className', () => {
    render(<StatusBadge status="active" className="custom-badge" />);

    expect(screen.getByRole('status').className).toContain('custom-badge');
  });

  it('has accessible aria-label', () => {
    render(<StatusBadge status="active" />);

    expect(screen.getByRole('status')).toHaveAttribute(
      'aria-label',
      'Status: Active'
    );
  });

  it('renders pulse indicator dot for active/running states', () => {
    const { container } = render(<StatusBadge status="active" pulse={true} />);

    const dot = container.querySelector('.rounded-full.bg-current');
    expect(dot).toBeInTheDocument();
  });
});

describe('StatusBadgeGroup', () => {
  it('renders multiple status badges in a group', () => {
    render(
      <StatusBadgeGroup>
        <StatusBadge status="active" />
        <StatusBadge status="paused" />
        <StatusBadge status="completed" />
      </StatusBadgeGroup>
    );

    expect(screen.getByText('Active')).toBeInTheDocument();
    expect(screen.getByText('Paused')).toBeInTheDocument();
    expect(screen.getByText('Completed')).toBeInTheDocument();
  });

  it('applies flex layout with gap', () => {
    const { container } = render(
      <StatusBadgeGroup>
        <StatusBadge status="active" />
      </StatusBadgeGroup>
    );

    const group = container.firstChild as HTMLElement;
    expect(group.className).toContain('flex');
    expect(group.className).toContain('gap-2');
  });

  it('applies custom className', () => {
    const { container } = render(
      <StatusBadgeGroup className="custom-group">
        <StatusBadge status="active" />
      </StatusBadgeGroup>
    );

    expect(container.querySelector('.custom-group')).toBeInTheDocument();
  });
});
