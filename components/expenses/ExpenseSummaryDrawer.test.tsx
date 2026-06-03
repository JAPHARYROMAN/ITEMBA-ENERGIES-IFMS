import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { ExpenseSummaryDrawer } from './ExpenseSummaryDrawer';

const repoMocks = vi.hoisted(() => ({
  listExpenses: vi.fn(),
}));

const exportMocks = vi.hoisted(() => ({
  downloadCSV: vi.fn(),
}));

vi.mock('../../lib/repositories', () => ({
  expenseRepo: { list: repoMocks.listExpenses },
}));

vi.mock('../../lib/exportUtils', () => ({
  downloadCSV: exportMocks.downloadCSV,
}));

vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children: ReactNode }) => (
    <div data-testid="expense-chart">{children}</div>
  ),
  PieChart: ({ children }: { children: ReactNode }) => <div data-testid="pie-chart">{children}</div>,
  Pie: ({ children, data }: { children: ReactNode; data: unknown[] }) => (
    <div data-testid="pie" data-slices={data.length}>
      {children}
    </div>
  ),
  Cell: ({ fill }: { fill: string }) => <span data-testid="pie-cell" data-fill={fill} />,
  Tooltip: () => <div data-testid="pie-tooltip" />,
}));

function renderDrawer() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <ExpenseSummaryDrawer />
    </QueryClientProvider>,
  );
}

describe('ExpenseSummaryDrawer', () => {
  beforeEach(() => {
    repoMocks.listExpenses.mockResolvedValue([
      { id: 'expense-1', category: 'Maintenance', amount: 100, timestamp: '2026-05-01T00:00:00Z' },
      { id: 'expense-2', category: 'Utilities', amount: 50, timestamp: '2026-05-02T00:00:00Z' },
      { id: 'expense-3', category: 'Maintenance', amount: 150, timestamp: '2026-05-03T00:00:00Z' },
    ]);
    exportMocks.downloadCSV.mockClear();
  });

  afterEach(() => {
    cleanup();
  });

  test('shows loading while expenses are pending', () => {
    repoMocks.listExpenses.mockReturnValue(new Promise(() => undefined));

    renderDrawer();

    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  test('groups expenses by category and exports the summary CSV', async () => {
    renderDrawer();

    expect(await screen.findByText('Expense Summary')).toBeInTheDocument();
    expect(screen.getByTestId('pie')).toHaveAttribute('data-slices', '2');
    expect(screen.getAllByTestId('pie-cell')).toHaveLength(2);
    expect(screen.getByText('Maintenance')).toBeInTheDocument();
    expect(screen.getByText('$250')).toBeInTheDocument();
    expect(screen.getByText('83.3%')).toBeInTheDocument();
    expect(screen.getByText('Utilities')).toBeInTheDocument();
    expect(screen.getByText('$50')).toBeInTheDocument();
    expect(screen.getByText('16.7%')).toBeInTheDocument();

    fireEvent.click(screen.getByTitle('Download as CSV'));

    expect(exportMocks.downloadCSV).toHaveBeenCalledWith(
      expect.stringMatching(/^expense-summary-\d{4}-\d{2}-\d{2}\.csv$/),
      ['Category', 'Amount', 'Share %'],
      [
        ['Maintenance', 250, '83.3%'],
        ['Utilities', 50, '16.7%'],
      ],
    );
  });
});
