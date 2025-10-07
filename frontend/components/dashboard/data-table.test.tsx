import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DataTable, DataTableContainer, type Column } from './data-table';

interface TestData {
  id: number;
  name: string;
  status: string;
}

const mockData: TestData[] = [
  { id: 1, name: 'Item 1', status: 'active' },
  { id: 2, name: 'Item 2', status: 'paused' },
  { id: 3, name: 'Item 3', status: 'completed' },
];

const mockColumns: Column<TestData>[] = [
  {
    key: 'name',
    header: 'Name',
    render: (row) => <span>{row.name}</span>,
  },
  {
    key: 'status',
    header: 'Status',
    render: (row) => <span>{row.status}</span>,
  },
];

describe('DataTable', () => {
  it('renders table with data', () => {
    render(<DataTable data={mockData} columns={mockColumns} />);

    expect(screen.getByText('Item 1')).toBeInTheDocument();
    expect(screen.getByText('Item 2')).toBeInTheDocument();
    expect(screen.getByText('Item 3')).toBeInTheDocument();
  });

  it('renders column headers correctly', () => {
    render(<DataTable data={mockData} columns={mockColumns} />);

    expect(screen.getByText('Name')).toBeInTheDocument();
    expect(screen.getByText('Status')).toBeInTheDocument();
  });

  it('shows empty state when data is empty', () => {
    render(
      <DataTable
        data={[]}
        columns={mockColumns}
        emptyMessage="No items found"
      />
    );

    expect(screen.getByText('No items found')).toBeInTheDocument();
  });

  it('shows default empty message when not provided', () => {
    render(<DataTable data={[]} columns={mockColumns} />);

    expect(screen.getByText('No data available')).toBeInTheDocument();
  });

  it('renders empty action button', async () => {
    const handleEmptyAction = vi.fn();
    const user = userEvent.setup();

    render(
      <DataTable
        data={[]}
        columns={mockColumns}
        emptyAction={{ label: 'Add Item', onClick: handleEmptyAction }}
      />
    );

    const button = screen.getByRole('button', { name: 'Add Item' });
    await user.click(button);

    expect(handleEmptyAction).toHaveBeenCalledTimes(1);
  });

  it('shows loading state', () => {
    const { container } = render(
      <DataTable data={mockData} columns={mockColumns} isLoading={true} />
    );

    expect(container.querySelector('.animate-pulse')).toBeInTheDocument();
    expect(screen.queryByText('Item 1')).not.toBeInTheDocument();
  });

  it('handles row click events', async () => {
    const handleRowClick = vi.fn();
    const user = userEvent.setup();

    render(
      <DataTable
        data={mockData}
        columns={mockColumns}
        onRowClick={handleRowClick}
      />
    );

    const rows = screen.getAllByRole('button');
    await user.click(rows[0]);

    expect(handleRowClick).toHaveBeenCalledWith(mockData[0], 0);
  });

  it('handles keyboard navigation on rows', async () => {
    const handleRowClick = vi.fn();
    const user = userEvent.setup();

    render(
      <DataTable
        data={mockData}
        columns={mockColumns}
        onRowClick={handleRowClick}
      />
    );

    const rows = screen.getAllByRole('button');
    rows[0].focus();
    await user.keyboard('{Enter}');

    expect(handleRowClick).toHaveBeenCalledWith(mockData[0], 0);
  });

  it('renders all rows when using custom key extractor', () => {
    const { container } = render(
      <DataTable
        data={mockData}
        columns={mockColumns}
        keyExtractor={(row) => `item-${row.id}`}
      />
    );

    const tbody = container.querySelector('tbody');
    const rows = tbody?.querySelectorAll('tr');
    // Verify all rows are rendered correctly with custom key
    expect(rows?.length).toBe(mockData.length);
  });

  it('applies column alignment classes', () => {
    const columnsWithAlignment: Column<TestData>[] = [
      {
        key: 'name',
        header: 'Name',
        render: (row) => <span>{row.name}</span>,
        align: 'left',
      },
      {
        key: 'status',
        header: 'Status',
        render: (row) => <span>{row.status}</span>,
        align: 'right',
      },
    ];

    const { container } = render(
      <DataTable data={mockData} columns={columnsWithAlignment} />
    );

    const headerCells = container.querySelectorAll('th');
    expect(headerCells[0].className).toContain('text-left');
    expect(headerCells[1].className).toContain('text-right');
  });

  it('hides columns on mobile when hideOnMobile is true', () => {
    const columnsWithMobile: Column<TestData>[] = [
      {
        key: 'name',
        header: 'Name',
        render: (row) => <span>{row.name}</span>,
      },
      {
        key: 'status',
        header: 'Status',
        render: (row) => <span>{row.status}</span>,
        hideOnMobile: true,
      },
    ];

    const { container } = render(
      <DataTable data={mockData} columns={columnsWithMobile} />
    );

    const headerCells = container.querySelectorAll('th');
    expect(headerCells[1].className).toContain('hidden');
    expect(headerCells[1].className).toContain('sm:table-cell');
  });

  it('applies compact padding when compact is true', () => {
    const { container } = render(
      <DataTable data={mockData} columns={mockColumns} compact={true} />
    );

    const cells = container.querySelectorAll('td');
    expect(cells[0].className).toContain('px-3');
    expect(cells[0].className).toContain('py-3');
  });

  it('applies hover effect by default', () => {
    const { container } = render(
      <DataTable data={mockData} columns={mockColumns} />
    );

    const rows = container.querySelectorAll('tbody tr');
    expect(rows[0].className).toContain('hover:bg-gray-50');
  });

  it('disables hover effect when hoverEffect is false', () => {
    const { container } = render(
      <DataTable data={mockData} columns={mockColumns} hoverEffect={false} />
    );

    const rows = container.querySelectorAll('tbody tr');
    expect(rows[0].className).not.toContain('hover:bg-gray-50');
  });

  it('applies custom className', () => {
    const { container } = render(
      <DataTable
        data={mockData}
        columns={mockColumns}
        className="custom-table"
      />
    );

    expect(container.querySelector('.custom-table')).toBeInTheDocument();
  });
});

describe('DataTableContainer', () => {
  it('renders children correctly', () => {
    render(
      <DataTableContainer>
        <div data-testid="table-content">Test Content</div>
      </DataTableContainer>
    );

    expect(screen.getByTestId('table-content')).toBeInTheDocument();
  });

  it('renders title when provided', () => {
    render(
      <DataTableContainer title="Campaign List">
        <div>Content</div>
      </DataTableContainer>
    );

    expect(screen.getByText('Campaign List')).toBeInTheDocument();
  });

  it('renders action button when provided', async () => {
    const handleAction = vi.fn();
    const user = userEvent.setup();

    render(
      <DataTableContainer action={{ label: 'View All', onClick: handleAction }}>
        <div>Content</div>
      </DataTableContainer>
    );

    const button = screen.getByRole('button', { name: 'View All' });
    await user.click(button);

    expect(handleAction).toHaveBeenCalledTimes(1);
  });

  it('renders both title and action', () => {
    render(
      <DataTableContainer
        title="Recent Items"
        action={{ label: 'See More', onClick: vi.fn() }}
      >
        <div>Content</div>
      </DataTableContainer>
    );

    expect(screen.getByText('Recent Items')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'See More' })).toBeInTheDocument();
  });

  it('applies custom className', () => {
    const { container } = render(
      <DataTableContainer className="custom-container">
        <div>Content</div>
      </DataTableContainer>
    );

    expect(container.querySelector('.custom-container')).toBeInTheDocument();
  });

  it('has proper card styling', () => {
    const { container } = render(
      <DataTableContainer>
        <div>Content</div>
      </DataTableContainer>
    );

    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper.className).toContain('bg-white');
    expect(wrapper.className).toContain('shadow');
    expect(wrapper.className).toContain('border');
  });
});
