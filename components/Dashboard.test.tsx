import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import Dashboard from './Dashboard';

const repoMocks = vi.hoisted(() => ({
  listSales: vi.fn(),
  listExpenses: vi.fn(),
}));

const storeMocks = vi.hoisted(() => ({
  addToast: vi.fn(),
}));

const exportMocks = vi.hoisted(() => ({
  triggerPrint: vi.fn(),
}));

vi.mock('../lib/repositories', () => ({
  saleRepo: { list: repoMocks.listSales },
  expenseRepo: { list: repoMocks.listExpenses },
}));

vi.mock('../store', () => ({
  useAppStore: () => ({ addToast: storeMocks.addToast }),
}));

vi.mock('../lib/hooks/useCurrency', () => ({
  useCurrency: () => ({
    fmt: (amount: number) => `TZS ${amount.toLocaleString()}`,
    fmtCompact: (amount: number) => `TZS ${amount.toLocaleString()}`,
  }),
}));

vi.mock('../lib/exportUtils', () => ({
  triggerPrint: exportMocks.triggerPrint,
}));

vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children: ReactNode }) => (
    <div data-testid="responsive-container">{children}</div>
  ),
  AreaChart: ({ children, data }: { children: ReactNode; data: unknown[] }) => (
    <div data-testid="area-chart" data-points={data.length}>
      {children}
    </div>
  ),
  Area: ({ dataKey }: { dataKey: string }) => <div data-testid={`area-${dataKey}`} />,
  XAxis: ({ dataKey }: { dataKey: string }) => <div data-testid={`x-axis-${dataKey}`} />,
  YAxis: () => <div data-testid="y-axis" />,
  CartesianGrid: () => <div data-testid="cartesian-grid" />,
  Tooltip: () => <div data-testid="chart-tooltip" />,
}));

const sales = [
  {
    id: 'sale-001',
    timestamp: '2026-01-15T08:30:00.000Z',
    totalAmount: 1000,
    paymentType: 'cash',
  },
  {
    id: 'sale-002',
    timestamp: '2026-02-20T13:45:00.000Z',
    totalAmount: 500,
    paymentType: 'card',
  },
];

const expenses = [
  { id: 'expense-001', timestamp: '2026-01-18T09:00:00.000Z', amount: 250, category: 'Maintenance' },
  { id: 'expense-002', timestamp: '2026-02-21T09:00:00.000Z', amount: 150, category: 'Utilities' },
];

function renderDashboard() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <Dashboard />
    </QueryClientProvider>,
  );
}

describe('Dashboard', () => {
  beforeEach(() => {
    repoMocks.listSales.mockResolvedValue(sales);
    repoMocks.listExpenses.mockResolvedValue(expenses);
    storeMocks.addToast.mockClear();
    exportMocks.triggerPrint.mockClear();
    vi.stubGlobal('open', vi.fn());
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  test('renders metrics, chart data, and recent transactions from repository data', async () => {
    renderDashboard();

    expect(await screen.findByText('Executive Overview')).toBeInTheDocument();
    expect(screen.getByText('Total Revenue')).toBeInTheDocument();
    expect(screen.getByText('TZS 1,500')).toBeInTheDocument();
    expect(screen.getByText('Operating Expenses')).toBeInTheDocument();
    expect(screen.getByText('TZS 400')).toBeInTheDocument();
    expect(screen.getByText('Net Profit')).toBeInTheDocument();
    expect(screen.getAllByText('TZS 1,100')).toHaveLength(2);

    expect(screen.getByTestId('area-chart')).toHaveAttribute('data-points', '2');
    expect(screen.getByTestId('area-budget')).toBeInTheDocument();
    expect(screen.getByTestId('area-actual')).toBeInTheDocument();
    expect(screen.getByText('Recent Transactions')).toBeInTheDocument();
    expect(screen.getByText('sale-001')).toBeInTheDocument();
    expect(screen.getByText('cash')).toBeInTheDocument();
    expect(screen.getByText('Viewing 2 most recent journal entries')).toBeInTheDocument();
  });

  test('export button triggers print flow and toast feedback', async () => {
    renderDashboard();
    await screen.findByText('Executive Overview');

    fireEvent.click(screen.getByLabelText('Export PDF'));

    expect(storeMocks.addToast).toHaveBeenCalledWith('Opening print dialog for PDF save...', 'info');
    expect(exportMocks.triggerPrint).toHaveBeenCalled();
  });

  test('generates the executive report in a new window when popups are available', async () => {
    const documentMock = {
      write: vi.fn(),
      close: vi.fn(),
    };
    vi.mocked(window.open).mockReturnValue({ document: documentMock } as unknown as Window);

    renderDashboard();
    await screen.findByText('Executive Overview');

    fireEvent.click(screen.getByLabelText('Generate executive report'));

    expect(documentMock.write).toHaveBeenCalledWith(expect.stringContaining('Executive Financial Summary'));
    expect(documentMock.write).toHaveBeenCalledWith(expect.stringContaining('Total Revenue'));
    expect(documentMock.close).toHaveBeenCalled();
    expect(storeMocks.addToast).toHaveBeenCalledWith(
      'Report opened in new tab. Use browser Print to save as PDF.',
      'success',
    );
  });

  test('reports popup-blocked feedback when no report window opens', async () => {
    vi.mocked(window.open).mockReturnValue(null);

    renderDashboard();
    await screen.findByText('Executive Overview');

    fireEvent.click(screen.getByLabelText('Generate executive report'));

    await waitFor(() => {
      expect(storeMocks.addToast).toHaveBeenCalledWith('Allow pop-ups to open the report.', 'info');
    });
  });
});
