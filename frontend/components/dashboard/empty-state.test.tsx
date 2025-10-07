import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EmptyState } from './empty-state';

describe('EmptyState', () => {
  it('renders title correctly', () => {
    render(<EmptyState title="No campaigns found" />);

    expect(screen.getByText('No campaigns found')).toBeInTheDocument();
  });

  it('renders description when provided', () => {
    render(
      <EmptyState
        title="No data"
        description="There are no items to display at this time"
      />
    );

    expect(
      screen.getByText('There are no items to display at this time')
    ).toBeInTheDocument();
  });

  it('renders icon when provided', () => {
    render(
      <EmptyState
        title="Empty"
        icon={<svg data-testid="empty-icon" />}
      />
    );

    expect(screen.getByTestId('empty-icon')).toBeInTheDocument();
  });

  it('renders primary action button', async () => {
    const handleClick = vi.fn();
    const user = userEvent.setup();

    render(
      <EmptyState
        title="No campaigns"
        action={{ label: 'Create Campaign', onClick: handleClick }}
      />
    );

    const button = screen.getByRole('button', { name: 'Create Campaign' });
    expect(button).toBeInTheDocument();

    await user.click(button);
    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it('renders secondary action button', async () => {
    const handleSecondaryClick = vi.fn();
    const user = userEvent.setup();

    render(
      <EmptyState
        title="No campaigns"
        secondaryAction={{
          label: 'Learn More',
          onClick: handleSecondaryClick,
        }}
      />
    );

    const button = screen.getByRole('button', { name: 'Learn More' });
    expect(button).toBeInTheDocument();

    await user.click(button);
    expect(handleSecondaryClick).toHaveBeenCalledTimes(1);
  });

  it('renders both primary and secondary actions', () => {
    const handlePrimary = vi.fn();
    const handleSecondary = vi.fn();

    render(
      <EmptyState
        title="No campaigns"
        action={{ label: 'Primary Action', onClick: handlePrimary }}
        secondaryAction={{
          label: 'Secondary Action',
          onClick: handleSecondary,
        }}
      />
    );

    expect(
      screen.getByRole('button', { name: 'Primary Action' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Secondary Action' })
    ).toBeInTheDocument();
  });

  it('applies custom className', () => {
    const { container } = render(
      <EmptyState title="Empty" className="custom-empty-state" />
    );

    expect(container.querySelector('.custom-empty-state')).toBeInTheDocument();
  });

  it('has proper styling for primary action button', () => {
    render(
      <EmptyState
        title="Empty"
        action={{ label: 'Action', onClick: vi.fn() }}
      />
    );

    const button = screen.getByRole('button', { name: 'Action' });
    expect(button.className).toContain('bg-indigo-600');
    expect(button.className).toContain('text-white');
  });

  it('has proper styling for secondary action button', () => {
    render(
      <EmptyState
        title="Empty"
        secondaryAction={{ label: 'Secondary', onClick: vi.fn() }}
      />
    );

    const button = screen.getByRole('button', { name: 'Secondary' });
    expect(button.className).toContain('ring-gray-300');
    expect(button.className).toContain('text-gray-700');
  });

  it('renders without actions', () => {
    render(<EmptyState title="No data" />);

    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('has responsive text sizing', () => {
    const { container } = render(<EmptyState title="Test" />);

    const title = screen.getByText('Test');
    expect(title.className).toContain('text-base');
    expect(title.className).toContain('sm:text-lg');
  });
});
