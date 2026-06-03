import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type * as React from 'react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { useAppStore, useReportsStore } from '../../store';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: string | { defaultValue?: string }) => {
      if (typeof options === 'string') return options;
      const labels: Record<string, string> = {
        'pages.reportsTitle': 'Reports',
        'pages.reportsDesc': 'Enterprise report overview',
        'common.export': 'Export',
      };
      return options?.defaultValue ?? labels[key] ?? key;
    },
  }),
}));

vi.mock('../reports/ReportFilters', async () => {
  const React = await import('react');
  return {
    default: () => React.createElement('div', { 'data-testid': 'report-filters' }, 'Report Filters'),
  };
});

vi.mock('../ifms/PageHeader', async () => {
  const React = await import('react');
  return {
    default: ({ title, description, actions }: { title: string; description?: string; actions?: React.ReactNode }) =>
      React.createElement(
        'header',
        {},
        React.createElement('h1', {}, title),
        description ? React.createElement('p', {}, description) : null,
        actions,
      ),
  };
});

vi.mock('../ifms/StatCard', async () => {
  const React = await import('react');
  return {
    default: ({ label, value, delta, trend }: { label: string; value: React.ReactNode; delta?: number; trend?: string }) =>
      React.createElement(
        'article',
        { 'data-testid': `stat-${label}` },
        React.createElement('span', {}, label),
        React.createElement('strong', {}, value),
        React.createElement('small', {}, `${delta ?? 'n/a'} ${trend ?? 'none'}`),
      ),
  };
});

vi.mock('../ifms/ExportButton', async () => {
  const React = await import('react');
  return {
    ExportButton: ({ exportType, label }: { exportType: string; label?: string }) =>
      React.createElement('button', { type: 'button', 'data-export-type': exportType }, label ?? 'Export'),
  };
});

vi.mock('../ifms/Skeletons', async () => {
  const React = await import('react');
  return {
    DashboardSkeleton: () => React.createElement('div', {}, 'Dashboard loading'),
    TableSkeleton: () => React.createElement('div', {}, 'Table loading'),
  };
});

vi.mock('../ifms/DetailsDrawer', async () => {
  const React = await import('react');
  return {
    default: ({
      isOpen,
      onClose,
      title,
      subtitle,
      children,
    }: {
      isOpen: boolean;
      onClose: () => void;
      title: string;
      subtitle?: string;
      children: React.ReactNode;
    }) =>
      isOpen
        ? React.createElement(
            'aside',
            { role: 'dialog', 'aria-label': title },
            React.createElement('h2', {}, title),
            subtitle ? React.createElement('p', {}, subtitle) : null,
            React.createElement('button', { type: 'button', onClick: onClose }, 'Close drawer'),
            children,
          )
        : null,
  };
});

vi.mock('../ifms/DataTable', async () => {
  const React = await import('react');
  type Column = {
    header: string;
    accessorKey: string;
    cell?: (row: Record<string, unknown>) => React.ReactNode;
  };
  return {
    IFMSDataTable: ({
      data,
      columns,
      onRowClick,
    }: {
      data: Record<string, unknown>[];
      columns: Column[];
      onRowClick?: (row: Record<string, unknown>) => void;
    }) =>
      React.createElement(
        'div',
        { 'data-testid': 'ifms-table' },
        React.createElement(
          'div',
          {},
          columns.map((column) =>
            React.createElement('span', { key: column.accessorKey }, column.header),
          ),
        ),
        data.map((row, rowIndex) => {
          const rowId = String(row.id ?? row.tankId ?? row.name ?? `row-${rowIndex}`);
          return React.createElement(
            'section',
            { key: rowId, 'data-testid': `row-${rowId}` },
            React.createElement('button', { type: 'button', onClick: () => onRowClick?.(row) }, `Open ${rowId}`),
            columns.map((column) =>
              React.createElement(
                'div',
                { key: `${rowId}-${column.accessorKey}` },
                column.cell ? column.cell(row) : (row[column.accessorKey] as React.ReactNode),
              ),
            ),
          );
        }),
      ),
  };
});

vi.mock('recharts', async () => {
  const React = await import('react');
  const makeComponent =
    (name: string) =>
    ({ children }: { children?: React.ReactNode }) =>
      React.createElement('div', { 'data-recharts': name }, children);
  const makeLeaf =
    (name: string) =>
    () =>
      React.createElement('span', { 'data-recharts': name });
  return {
    ResponsiveContainer: makeComponent('ResponsiveContainer'),
    LineChart: makeComponent('LineChart'),
    BarChart: makeComponent('BarChart'),
    AreaChart: makeComponent('AreaChart'),
    ComposedChart: makeComponent('ComposedChart'),
    Bar: makeComponent('Bar'),
    Line: makeLeaf('Line'),
    Area: makeLeaf('Area'),
    Cell: makeLeaf('Cell'),
    XAxis: makeLeaf('XAxis'),
    YAxis: makeLeaf('YAxis'),
    CartesianGrid: makeLeaf('CartesianGrid'),
    Tooltip: makeLeaf('Tooltip'),
    Legend: makeLeaf('Legend'),
  };
});

vi.mock('../../lib/hooks/useCurrency', () => ({
  useCurrency: () => ({
    symbol: '$',
    header: (label: string) => `${label} ($)`,
    fmt: (value: number) => `$${Number(value || 0).toFixed(2)}`,
    fmtCompact: (value: number) => `$${Number(value || 0).toLocaleString()}`,
  }),
}));

vi.mock('../../lib/api/reports', () => ({
  apiReports: {
    overview: vi.fn(),
    creditCashflow: vi.fn(),
    dailyOperations: vi.fn(),
    stockLoss: vi.fn(),
    profitability: vi.fn(),
    stationComparison: vi.fn(),
  },
}));

vi.mock('../../lib/api/actions', () => ({
  postReportAction: vi.fn(),
  postCustomerAction: vi.fn(),
}));

import { postCustomerAction, postReportAction } from '../../lib/api/actions';
import { apiReports } from '../../lib/api/reports';
import CreditCashflowReport from './CreditCashflowReport';
import DailyOperationsReport from './DailyOperationsReport';
import ProfitabilityReport from './ProfitabilityReport';
import ReportsOverview from './ReportsOverview';
import StationComparisonReport from './StationComparisonReport';
import StockLossReport from './StockLossReport';

const reportActions = vi.mocked(postReportAction);
const customerActions = vi.mocked(postCustomerAction);
const reports = vi.mocked(apiReports);

function renderPage(component: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}>{component}</QueryClientProvider>);
  return client;
}

function resetReportFilters() {
  useReportsStore.setState({
    dateRange: { from: '2026-06-01', to: '2026-06-30' },
    stationId: 'station-1',
    productId: 'diesel',
  });
}

const overviewFixture = {
  kpis: {
    totalSales: { value: 120000, change: 12, trend: 'up' },
    litersSold: { value: 43000, change: 4, trend: 'up' },
    grossMargin: { value: 22000, change: -1, trend: 'down' },
    shrinkage: { value: 0.4, change: 0, trend: 'neutral' },
    receivables: { value: 14000, change: 2, trend: 'up' },
    payables: { value: 9000, change: -3, trend: 'down' },
  },
  salesTrend: [{ date: '2026-06-01', amount: 18000 }],
  paymentMix: [
    { name: 'Cash', value: 50000 },
    { name: 'Card', value: 70000 },
  ],
  varianceByStation: [
    { station: 'Downtown', variance: -25, status: 'Critical' },
    { station: 'Highway', variance: 12, status: 'Normal' },
  ],
  topDebtors: [{ name: 'ACME Logistics', balance: 45000, utilization: 91 }],
};

const creditFixture = {
  liquidity: {
    current: 100000,
    totalReceivables: 160000,
    totalPayables: 80000,
    collectionEfficiencyPct: 82,
  },
  arAging: [
    { bucket: '0-30', amount: 60000, color: '#10b981', percentage: 40 },
    { bucket: '31-60', amount: 40000, color: '#f59e0b', percentage: 27 },
  ],
  apAging: [
    { bucket: '0-30', amount: 50000, color: '#10b981' },
    { bucket: '60+', amount: 25000, color: '#ef4444' },
  ],
  simulation: {
    opening: 90000,
    collections: 45000,
    payables: 30000,
    expenses: 8000,
    projected: 107000,
    efficiency: 82,
  },
  topDebtors: [
    {
      id: 'debtor-1',
      name: 'ACME Logistics',
      balance: 76000,
      limit: 100000,
      utilization: 92,
      status: 'At Risk',
      lastPaymentAmount: 9000,
      lastPayment: '2026-06-01',
      invoices: [{ id: 'inv-1', invoiceNumber: 'INV-100', date: '2026-06-01', amount: 24000, status: 'Overdue' }],
      payments: [{ id: 'pmt-1', date: '2026-05-28', amount: 9000 }],
    },
  ],
};

const dailyFixture = {
  stats: { avgShiftVariance: -45, auditCompliancePct: 96, pendingClosures: 2 },
  shifts: [
    {
      id: 'shift-1',
      startTime: '2026-06-03T06:00:00.000Z',
      endTime: null,
      status: 'open',
      cashierName: 'Jane Cashier',
      expectedSales: 1000,
      actualSales: 940,
      variance: -60,
      efficiency: 94.5,
    },
  ],
  pumps: [
    {
      id: 'pump-1',
      nozzle: 'P01-N01',
      product: 'Diesel',
      liters: 2400,
      revenue: 6000,
      uptime: 88,
      status: 'Alert',
    },
  ],
  payments: [
    { name: 'Cash', value: 4000 },
    { name: 'Card', value: 6000 },
  ],
};

const stockLossFixture = {
  summary: { netLossLiters: -540, valueLoss: 2100, avgShrinkagePct: 0.8 },
  shrinkageTrend: [{ date: '2026-06-01', rate: 0.6 }],
  tankLosses: [
    {
      tankId: 'tank-1',
      station: 'Downtown',
      product: 'Diesel',
      expected: 10000,
      actual: 9650,
      variance: -350,
      variancePct: -0.62,
    },
  ],
  deliveryReconciliation: [
    {
      id: 'grn-1',
      date: '2026-06-02',
      ordered: 12000,
      billOfLading: 11900,
      received: 11850,
      variance: -50,
    },
  ],
};

const profitabilityFixture = {
  metrics: {
    grossProfit: { value: 52000, change: 6, trend: 'up' },
    netProfit: { value: 33000, change: 4, trend: 'up' },
    marginPerLiter: { value: 0.45, change: 1, trend: 'up' },
    opexRatio: { value: 12.5, change: -2, trend: 'down' },
  },
  marginByProduct: [{ name: 'Diesel', revenue: 120000, margin: 25000, marginPerLiter: 0.38 }],
  stationContribution: [
    {
      id: 'station-a',
      name: 'Downtown',
      location: 'Central',
      revenue: 140000,
      sales: 140000,
      liters: 50000,
      grossMargin: 30000,
      allocatedOpEx: 12000,
      contribution: 18000,
      marginPct: 18.5,
      shrinkagePct: 0.3,
      varianceCount: 1,
      overdueAR: 7000,
      expenseRatio: 9,
    },
  ],
  priceImpact: {
    before: { revenue: 100000, margin: 25000 },
    after: { revenue: 105000, margin: 30000 },
    delta: { revenue: 5000, margin: 5000 },
  },
};

const stationComparisonFixture = [
  {
    id: 'station-a',
    name: 'Downtown',
    location: 'Central',
    sales: 140000,
    liters: 50000,
    grossMargin: 30000,
    allocatedOpEx: 12000,
    contribution: 18000,
    marginPct: 18.5,
    shrinkagePct: 0.3,
    varianceCount: 1,
    overdueAR: 7000,
    expenseRatio: 9,
    rank: 1,
    percentile: 98,
    trend: [{ value: 10 }, { value: 14 }],
  },
  {
    id: 'station-b',
    name: 'Highway',
    location: 'North',
    sales: 98000,
    liters: 41000,
    grossMargin: 17000,
    allocatedOpEx: 11000,
    contribution: 6000,
    marginPct: 12.2,
    shrinkagePct: 1.4,
    varianceCount: 4,
    overdueAR: 12000,
    expenseRatio: 14,
    rank: 3,
    percentile: 72,
    trend: [{ value: 8 }, { value: 7 }],
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  cleanup();
  localStorage.clear();
  resetReportFilters();
  useAppStore.setState({ toasts: [] });
  Object.defineProperty(window, 'print', { value: vi.fn(), configurable: true });
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText: vi.fn().mockResolvedValue(undefined) },
    configurable: true,
  });
  reports.overview.mockResolvedValue(overviewFixture as never);
  reports.creditCashflow.mockResolvedValue(creditFixture as never);
  reports.dailyOperations.mockResolvedValue(dailyFixture as never);
  reports.stockLoss.mockResolvedValue(stockLossFixture as never);
  reports.profitability.mockResolvedValue(profitabilityFixture as never);
  reports.stationComparison.mockResolvedValue(stationComparisonFixture as never);
  reportActions.mockResolvedValue({ ok: true } as never);
  customerActions.mockResolvedValue({ ok: true } as never);
});

afterEach(cleanup);

describe('report dashboard pages', () => {
  test('ReportsOverview sends filter params and renders KPI, chart, and table data', async () => {
    renderPage(<ReportsOverview />);

    expect(await screen.findByText('Reports')).toBeInTheDocument();
    expect(screen.getByText('Total Revenue')).toBeInTheDocument();
    expect(screen.getByText('43,000 L')).toBeInTheDocument();
    expect(screen.getByText('Payment Mix')).toBeInTheDocument();
    expect(screen.getByText('ACME Logistics')).toBeInTheDocument();
    expect(reports.overview).toHaveBeenCalledWith({
      dateFrom: '2026-06-01',
      dateTo: '2026-06-30',
      stationId: 'station-1',
      productId: 'diesel',
    });
  });

  test('ReportsOverview shows the dashboard skeleton while loading', () => {
    reports.overview.mockReturnValue(new Promise(() => {}) as never);

    renderPage(<ReportsOverview />);

    expect(screen.getByText('Dashboard loading')).toBeInTheDocument();
  });

  test('ReportsOverview falls back on query errors and omits absent optional filters', async () => {
    useReportsStore.setState({
      dateRange: { from: '2026-06-10', to: '2026-06-12' },
      stationId: null,
      productId: null,
    });
    reports.overview.mockRejectedValueOnce(new Error('Overview unavailable') as never);

    renderPage(<ReportsOverview />);

    expect(await screen.findByText('Reports')).toBeInTheDocument();
    expect(screen.getByText('undefined L')).toBeInTheDocument();
    expect(screen.getByText('undefined%')).toBeInTheDocument();
    expect(screen.queryByText('ACME Logistics')).not.toBeInTheDocument();
    expect(reports.overview).toHaveBeenCalledWith({
      dateFrom: '2026-06-10',
      dateTo: '2026-06-12',
      stationId: undefined,
      productId: undefined,
    });
  });

  test('CreditCashflowReport queues reminders, sorts debtors, opens drawer, and posts customer actions', async () => {
    renderPage(<CreditCashflowReport />);

    expect(await screen.findByText('Credit & Cashflow Intelligence')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Bulk Reminders' }));
    await waitFor(() =>
      expect(reportActions).toHaveBeenCalledWith('bulk-reminders', {
        payload: { stationId: 'station-1', productId: 'diesel' },
      }),
    );
    expect(useAppStore.getState().toasts.at(-1)?.message).toBe(
      'Bulk payment reminders queued for delivery',
    );

    fireEvent.click(screen.getByRole('button', { name: 'Recent Invoices First' }));
    expect(screen.getByRole('button', { name: 'Balance High First' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Open debtor-1' }));
    expect(await screen.findByRole('dialog', { name: 'Account Intelligence Profile' })).toBeInTheDocument();
    expect(screen.getByText('INV-100')).toBeInTheDocument();

    fireEvent.click(screen.getByText('+265 (0) 88 123 4567'));
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('+265881234567');

    fireEvent.click(screen.getByRole('button', { name: 'Send Digital Payment Link' }));
    fireEvent.click(screen.getByRole('button', { name: 'Flag for Collection Legal' }));

    await waitFor(() =>
      expect(customerActions).toHaveBeenCalledWith('debtor-1', 'send-payment-link'),
    );
    expect(customerActions).toHaveBeenCalledWith('debtor-1', 'escalate-legal');
  });

  test('CreditCashflowReport renders debtor fallbacks, closes drawer, and reports customer action failures', async () => {
    reports.creditCashflow.mockResolvedValueOnce({
      ...creditFixture,
      topDebtors: [
        {
          id: 'debtor-low',
          name: 'Blue Haulage',
          balance: 1200,
          limit: 10000,
          utilization: 45,
          status: 'Healthy',
          lastPaymentAmount: 0,
          lastPayment: null,
          invoices: [
            { id: 'invoice-without-number', date: '2026-06-04', amount: 1200, status: 'Pending' },
          ],
          payments: [],
        },
        {
          ...creditFixture.topDebtors[0],
          id: 'debtor-high',
          balance: 98000,
          utilization: 95,
        },
      ],
    } as never);
    customerActions.mockRejectedValueOnce(new Error('Payment service offline') as never);

    renderPage(<CreditCashflowReport />);

    expect(await screen.findByText('Credit & Cashflow Intelligence')).toBeInTheDocument();
    expect(screen.getByText('Healthy')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Recent Invoices First' }));
    expect(screen.getByRole('button', { name: 'Balance High First' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Open debtor-low' }));
    expect(await screen.findByRole('dialog', { name: 'Account Intelligence Profile' })).toBeInTheDocument();
    expect(screen.getByText('invoice-without-number')).toBeInTheDocument();
    expect(screen.getByText('Pending')).toBeInTheDocument();

    fireEvent.click(screen.getByText('accounts@acme-logistics.com'));
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('accounts@acme-logistics.com');

    fireEvent.click(screen.getByRole('button', { name: 'Full Statement' }));
    expect(window.print).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: 'Send Digital Payment Link' }));
    await waitFor(() =>
      expect(useAppStore.getState().toasts.at(-1)).toMatchObject({
        message: 'Payment service offline',
        type: 'error',
      }),
    );

    customerActions.mockRejectedValueOnce(new Error('Legal queue offline') as never);
    fireEvent.click(screen.getByRole('button', { name: 'Flag for Collection Legal' }));
    await waitFor(() =>
      expect(useAppStore.getState().toasts.at(-1)).toMatchObject({
        message: 'Legal queue offline',
        type: 'error',
      }),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Close drawer' }));
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Account Intelligence Profile' })).not.toBeInTheDocument(),
    );
  });

  test('CreditCashflowReport guards customer actions for debtor rows without ids', async () => {
    reports.creditCashflow.mockResolvedValueOnce({
      ...creditFixture,
      topDebtors: [
        {
          name: 'No Id Corp',
          balance: 0,
          limit: 0,
          utilization: 0,
          status: 'Healthy',
          lastPaymentAmount: 0,
          lastPayment: null,
          invoices: undefined,
          payments: undefined,
        },
      ],
    } as never);

    renderPage(<CreditCashflowReport />);

    expect(await screen.findByText('Credit & Cashflow Intelligence')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Open No Id Corp' }));
    expect(await screen.findByRole('dialog', { name: 'Account Intelligence Profile' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Send Digital Payment Link' }));
    fireEvent.click(screen.getByRole('button', { name: 'Flag for Collection Legal' }));
    expect(customerActions).not.toHaveBeenCalled();
  });

  test('DailyOperationsReport switches tabs and posts shift audit decisions from drawer', async () => {
    renderPage(<DailyOperationsReport />);

    expect(await screen.findByText('Daily Operations')).toBeInTheDocument();
    expect(screen.getByText('Avg. Shift Variance')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Pumps & Nozzles/i }));
    expect(screen.getByText(/Anomaly Detected/i)).toBeInTheDocument();
    expect(screen.getByText('P01-N01')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Payments Mix/i }));
    expect(screen.getByText('Settlement Breakdown')).toBeInTheDocument();
    expect(screen.getByText('Payment Reconciliation Notes')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Shifts & Reconciliation/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Open shift-1' }));
    expect(await screen.findByRole('dialog', { name: 'Shift Detail Analysis' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Approve & File Audit' }));
    fireEvent.click(screen.getByRole('button', { name: 'Flag for Review' }));

    await waitFor(() =>
      expect(reportActions).toHaveBeenCalledWith('approve-shift-audit', { targetId: 'shift-1' }),
    );
    expect(reportActions).toHaveBeenCalledWith('flag-shift-audit', { targetId: 'shift-1' });
  });

  test('StockLossReport handles audit request and loss classification workflow', async () => {
    renderPage(<StockLossReport />);

    expect(await screen.findByText('Stock Loss Intelligence')).toBeInTheDocument();
    expect(screen.getByText('Operational Alerts')).toBeInTheDocument();
    expect(screen.getByText('grn-1')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Request Physical Audit' }));
    await waitFor(() =>
      expect(reportActions).toHaveBeenCalledWith('request-physical-audit', {
        targetId: undefined,
        payload: { stationId: 'station-1', productId: 'diesel' },
      }),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Classify Losses' }));
    expect(await screen.findByRole('dialog', { name: 'Loss Classification & Attribution' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Evaporation/i }));
    await waitFor(() =>
      expect(reportActions).toHaveBeenCalledWith('classify-loss', {
        targetId: undefined,
        payload: { category: 'Evaporation' },
      }),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Update Inventory Journals' }));
    await waitFor(() =>
      expect(reportActions).toHaveBeenCalledWith('update-inventory-journals', {
        targetId: undefined,
        payload: { classification: 'Evaporation' },
      }),
    );
  });

  test('StockLossReport shows table loading fallbacks while report data is pending', () => {
    reports.stockLoss.mockReturnValue(new Promise(() => {}) as never);

    renderPage(<StockLossReport />);

    expect(screen.getByText('Stock Loss Intelligence')).toBeInTheDocument();
    expect(screen.getAllByText('Table loading')).toHaveLength(2);
    expect(screen.getByText('0 L')).toBeInTheDocument();
  });

  test('StockLossReport renders positive variance styling branches', async () => {
    reports.stockLoss.mockResolvedValueOnce({
      ...stockLossFixture,
      summary: { netLossLiters: 42, valueLoss: 0, avgShrinkagePct: 0.12 },
      tankLosses: [
        {
          tankId: 'tank-positive',
          station: 'Depot',
          product: 'Petrol',
          expected: 1000,
          actual: 1042,
          variance: 42,
          variancePct: 0.2,
        },
      ],
      deliveryReconciliation: [
        {
          id: 'grn-positive',
          date: '2026-06-05',
          ordered: 900,
          billOfLading: 920,
          received: 950,
          variance: 30,
        },
      ],
    } as never);

    renderPage(<StockLossReport />);

    expect(await screen.findByText('Stock Loss Intelligence')).toBeInTheDocument();
    expect(screen.getByText('+42')).toBeInTheDocument();
    expect(screen.getByText('0.20%')).toBeInTheDocument();
    expect(screen.getByText('+30 L')).toBeInTheDocument();
  });

  test('StockLossReport reports action errors and can update journals without a selected category', async () => {
    renderPage(<StockLossReport />);

    expect(await screen.findByText('Stock Loss Intelligence')).toBeInTheDocument();
    reportActions.mockRejectedValueOnce(new Error('Audit scheduler offline') as never);
    fireEvent.click(screen.getByRole('button', { name: 'Request Physical Audit' }));
    await waitFor(() =>
      expect(useAppStore.getState().toasts.at(-1)).toMatchObject({
        message: 'Audit scheduler offline',
        type: 'error',
      }),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Classify Losses' }));
    expect(await screen.findByRole('dialog', { name: 'Loss Classification & Attribution' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Update Inventory Journals' }));
    await waitFor(() =>
      expect(reportActions).toHaveBeenCalledWith('update-inventory-journals', {
        targetId: undefined,
        payload: { classification: null },
      }),
    );

    reportActions.mockRejectedValueOnce(new Error('Classification service offline') as never);
    fireEvent.click(screen.getByRole('button', { name: /Leakage \/ Technical/i }));
    await waitFor(() =>
      expect(useAppStore.getState().toasts.at(-1)).toMatchObject({
        message: 'Classification service offline',
        type: 'error',
      }),
    );
  });

  test('ProfitabilityReport runs sensitivity simulation and opens station drilldown', async () => {
    renderPage(<ProfitabilityReport />);

    expect(await screen.findByText('Executive Profitability Analysis')).toBeInTheDocument();
    expect(screen.getByText('Strategic Insights')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Run Sensitivity Simulation' }));
    await waitFor(() =>
      expect(reportActions).toHaveBeenCalledWith('run-sensitivity-simulation', {
        payload: { stationId: 'station-1', productId: 'diesel' },
      }),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Open station-a' }));
    expect(await screen.findByRole('dialog', { name: 'Profitability Drilldown' })).toBeInTheDocument();
    expect(screen.getByText(/Contribution Margin 2/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Export Detailed P&L' }));
    expect(window.print).toHaveBeenCalledTimes(1);
    expect(useAppStore.getState().toasts.at(-1)?.message).toBe('Detailed P&L export started');
  });

  test('ProfitabilityReport shows the dashboard skeleton while loading', () => {
    reports.profitability.mockReturnValue(new Promise(() => {}) as never);

    renderPage(<ProfitabilityReport />);

    expect(screen.getByText('Dashboard loading')).toBeInTheDocument();
  });

  test('StationComparisonReport pins, selects, compares, and closes the benchmark modal', async () => {
    renderPage(<StationComparisonReport />);

    expect(await screen.findByText('Branch Comparative Intelligence')).toBeInTheDocument();
    expect(screen.getByText('Showing 2 active nodes')).toBeInTheDocument();

    fireEvent.click(screen.getAllByRole('button', { name: '' })[0]);
    await waitFor(() =>
      expect(localStorage.getItem('ifms-pinned-stations')).toContain('station-a'),
    );

    fireEvent.click(screen.getAllByRole('button', { name: '+ Compare' })[0]);
    fireEvent.click(screen.getAllByRole('button', { name: '+ Compare' })[0]);
    fireEvent.click(screen.getByRole('button', { name: 'Compare 2 Stations' }));

    const modal = await screen.findByText('Multi-Station Benchmarking');
    expect(modal).toBeInTheDocument();
    expect(screen.getByText('Comparing 2 Selected Branches')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Dismiss Analysis' }));
    await waitFor(() =>
      expect(screen.queryByText('Multi-Station Benchmarking')).not.toBeInTheDocument(),
    );
  });

  test('StationComparisonReport restores pinned stations from storage and sorts them first', async () => {
    localStorage.setItem('ifms-pinned-stations', JSON.stringify(['station-b']));

    renderPage(<StationComparisonReport />);

    expect(await screen.findByText('Showing 2 active nodes')).toBeInTheDocument();
    const highway = screen.getByText('Highway');
    const downtown = screen.getByText('Downtown');
    expect(highway.compareDocumentPosition(downtown) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  test('StationComparisonReport keeps compare disabled under two selections and caps selections at four', async () => {
    reports.stationComparison.mockResolvedValueOnce([
      ...stationComparisonFixture,
      {
        ...stationComparisonFixture[0],
        id: 'station-c',
        name: 'Airport',
        rank: 2,
        percentile: 80,
      },
      {
        ...stationComparisonFixture[1],
        id: 'station-d',
        name: 'Harbor',
        rank: 4,
        percentile: 60,
      },
      {
        ...stationComparisonFixture[1],
        id: 'station-e',
        name: 'Industrial',
        rank: 5,
        percentile: 50,
      },
    ] as never);

    renderPage(<StationComparisonReport />);

    expect(await screen.findByText('Showing 5 active nodes')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Compare 0 Stations' })).toBeDisabled();

    fireEvent.click(screen.getAllByRole('button', { name: '+ Compare' })[0]);
    expect(screen.getByRole('button', { name: 'Compare 1 Stations' })).toBeDisabled();

    fireEvent.click(screen.getAllByRole('button', { name: '+ Compare' })[0]);
    fireEvent.click(screen.getAllByRole('button', { name: '+ Compare' })[0]);
    fireEvent.click(screen.getAllByRole('button', { name: '+ Compare' })[0]);
    expect(screen.getByRole('button', { name: 'Compare 4 Stations' })).not.toBeDisabled();

    fireEvent.click(screen.getAllByRole('button', { name: '+ Compare' })[0]);
    expect(screen.getByRole('button', { name: 'Compare 4 Stations' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Compare 4 Stations' }));
    expect(await screen.findByText('Comparing 4 Selected Branches')).toBeInTheDocument();

    const backdrop = document.querySelector('.fixed .absolute.inset-0') as HTMLElement;
    fireEvent.click(backdrop);
    await waitFor(() =>
      expect(screen.queryByText('Multi-Station Benchmarking')).not.toBeInTheDocument(),
    );
  });

  test('report action errors use fallback messages', async () => {
    reportActions.mockRejectedValueOnce(new Error('Queue unavailable') as never);
    renderPage(<CreditCashflowReport />);

    await screen.findByText('Credit & Cashflow Intelligence');
    fireEvent.click(screen.getByRole('button', { name: 'Bulk Reminders' }));

    await waitFor(() =>
      expect(useAppStore.getState().toasts.at(-1)).toMatchObject({
        message: 'Queue unavailable',
        type: 'error',
      }),
    );
  });
});
