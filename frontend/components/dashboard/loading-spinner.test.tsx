import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { LoadingSpinner } from './loading-spinner';

describe('LoadingSpinner', () => {
  it('renders spinner with default props', () => {
    render(<LoadingSpinner />);

    const spinner = screen.getByRole('status');
    expect(spinner).toBeInTheDocument();
    expect(spinner).toHaveAttribute('aria-label', 'Loading');
  });

  it('renders with loading message', () => {
    render(<LoadingSpinner message="Loading data..." />);

    expect(screen.getByText('Loading data...')).toBeInTheDocument();
  });

  it('renders in centered layout when centered prop is true', () => {
    const { container } = render(<LoadingSpinner centered />);

    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper.className).toContain('flex');
    expect(wrapper.className).toContain('items-center');
    expect(wrapper.className).toContain('justify-center');
  });

  it('renders in inline layout when centered is false', () => {
    const { container } = render(<LoadingSpinner centered={false} />);

    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper.className).toContain('inline-flex');
  });

  it('applies different size classes', () => {
    const { rerender, container } = render(<LoadingSpinner size="sm" />);
    let spinner = container.querySelector('.animate-spin');
    expect(spinner?.className).toContain('h-4');
    expect(spinner?.className).toContain('w-4');

    rerender(<LoadingSpinner size="md" />);
    spinner = container.querySelector('.animate-spin');
    expect(spinner?.className).toContain('h-8');
    expect(spinner?.className).toContain('w-8');

    rerender(<LoadingSpinner size="lg" />);
    spinner = container.querySelector('.animate-spin');
    expect(spinner?.className).toContain('h-12');
    expect(spinner?.className).toContain('w-12');
  });

  it('applies custom className', () => {
    const { container } = render(<LoadingSpinner className="custom-spinner" />);

    expect(container.querySelector('.custom-spinner')).toBeInTheDocument();
  });

  it('has spinning animation', () => {
    const { container } = render(<LoadingSpinner />);

    const spinner = container.querySelector('.animate-spin');
    expect(spinner).toBeInTheDocument();
  });

  it('has accessible screen reader text', () => {
    render(<LoadingSpinner />);

    expect(screen.getByText('Loading...')).toHaveClass('sr-only');
  });

  it('renders centered with message', () => {
    render(<LoadingSpinner centered message="Please wait..." />);

    const message = screen.getByText('Please wait...');
    expect(message).toBeInTheDocument();
    expect(message.tagName).toBe('P');
  });

  it('renders inline with message', () => {
    render(<LoadingSpinner message="Loading data..." />);

    const message = screen.getByText('Loading data...');
    expect(message).toBeInTheDocument();
    expect(message.tagName).toBe('SPAN');
  });
});
