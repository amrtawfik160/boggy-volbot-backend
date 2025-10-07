import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MetricCard, MetricCardGrid } from './metric-card';

describe('MetricCard', () => {
  it('renders label and value correctly', () => {
    render(<MetricCard label="Active Campaigns" value={42} />);

    expect(screen.getByText('Active Campaigns')).toBeInTheDocument();
    expect(screen.getByText('42')).toBeInTheDocument();
  });

  it('renders with string value', () => {
    render(<MetricCard label="Total Volume" value="$1.5M" />);

    expect(screen.getByText('$1.5M')).toBeInTheDocument();
  });

  it('displays subtitle when provided', () => {
    render(
      <MetricCard
        label="Success Rate"
        value="95%"
        subtitle="Last 24 hours"
      />
    );

    expect(screen.getByText('Last 24 hours')).toBeInTheDocument();
  });

  it('shows loading state', () => {
    const { container } = render(
      <MetricCard label="Loading" value={0} isLoading={true} />
    );

    expect(container.querySelector('.animate-pulse')).toBeInTheDocument();
    expect(screen.queryByText('Loading')).not.toBeInTheDocument();
  });

  it('renders trend indicator with positive trend', () => {
    render(
      <MetricCard
        label="Transactions"
        value={100}
        trend={{ value: 15, isPositive: true, label: 'vs last week' }}
      />
    );

    expect(screen.getByText(/↑/)).toBeInTheDocument();
    expect(screen.getByText(/15%/)).toBeInTheDocument();
    expect(screen.getByText('vs last week')).toBeInTheDocument();
  });

  it('renders trend indicator with negative trend', () => {
    render(
      <MetricCard
        label="Transactions"
        value={100}
        trend={{ value: 10, isPositive: false }}
      />
    );

    expect(screen.getByText(/↓/)).toBeInTheDocument();
    expect(screen.getByText(/10%/)).toBeInTheDocument();
  });

  it('renders trend indicator with neutral trend', () => {
    render(
      <MetricCard
        label="Transactions"
        value={100}
        trend={{ value: 0 }}
      />
    );

    expect(screen.getByText(/→/)).toBeInTheDocument();
    expect(screen.getByText(/0%/)).toBeInTheDocument();
  });

  it('handles click events when onClick is provided', async () => {
    const handleClick = vi.fn();
    const user = userEvent.setup();

    render(
      <MetricCard
        label="Campaigns"
        value={5}
        onClick={handleClick}
      />
    );

    const card = screen.getByRole('button');
    await user.click(card);

    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it('handles keyboard events when onClick is provided', async () => {
    const handleClick = vi.fn();
    const user = userEvent.setup();

    render(
      <MetricCard
        label="Campaigns"
        value={5}
        onClick={handleClick}
      />
    );

    const card = screen.getByRole('button');
    card.focus();
    await user.keyboard('{Enter}');

    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it('does not have role=button when onClick is not provided', () => {
    render(<MetricCard label="Static" value={10} />);

    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('applies custom className', () => {
    const { container } = render(
      <MetricCard label="Test" value={1} className="custom-class" />
    );

    expect(container.querySelector('.custom-class')).toBeInTheDocument();
  });

  it('renders icon when provided', () => {
    render(
      <MetricCard
        label="Test"
        value={1}
        icon={<svg data-testid="test-icon" />}
      />
    );

    expect(screen.getByTestId('test-icon')).toBeInTheDocument();
  });
});

describe('MetricCardGrid', () => {
  it('renders children in grid layout', () => {
    render(
      <MetricCardGrid>
        <MetricCard label="Card 1" value={1} />
        <MetricCard label="Card 2" value={2} />
        <MetricCard label="Card 3" value={3} />
      </MetricCardGrid>
    );

    expect(screen.getByText('Card 1')).toBeInTheDocument();
    expect(screen.getByText('Card 2')).toBeInTheDocument();
    expect(screen.getByText('Card 3')).toBeInTheDocument();
  });

  it('applies responsive grid classes', () => {
    const { container } = render(
      <MetricCardGrid>
        <div>Test</div>
      </MetricCardGrid>
    );

    const grid = container.firstChild as HTMLElement;
    expect(grid.className).toContain('grid');
    expect(grid.className).toContain('sm:grid-cols-2');
    expect(grid.className).toContain('lg:grid-cols-3');
  });

  it('applies custom className', () => {
    const { container } = render(
      <MetricCardGrid className="custom-grid">
        <div>Test</div>
      </MetricCardGrid>
    );

    expect(container.querySelector('.custom-grid')).toBeInTheDocument();
  });
});
