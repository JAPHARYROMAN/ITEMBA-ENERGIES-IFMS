import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type * as React from 'react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { useAppStore } from '../../store';
import CreditAgingPage from './CreditAgingPage';
import ExportsPage from './ExportsPage';
import PayablesAgingPage from './PayablesAgingPage';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string) =>
      ({
        'pages.exportsTitle': 'Exports',
        'pages.exportsDesc': 'Export history',
      })[key] ?? fallback ?? key,
  }),
}));

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

vi.mock('../ifms/Skeletons', async () => {
  const React = await import('react');
  return { TableSkeleton: ({ rows }: { rows?: number }) => React.createElement('div', {}, `Table loading ${rows ?? ''}`) };
});

vi.mock('../../lib/repositories', () => ({
  creditAgingRepo: { getReport: vi.fn() },
  payablesAgingRepo: { getReport: vi.fn() },
}));

vi.mock('../../lib/api/exports', () => ({
  apiExports: {
    list: vi.fn(),
    download: vi.fn(),
    downloadVerificationReceipt: vi.fn(),
    verifyUrl: vi.fn((token: string) => `/verify/${token}`),
  },
}));

import { apiExports } from '../../lib/api/exports';
import { creditAgingRepo, payablesAgingRepo } from '../../lib/repositories';

const creditAging = vi.mocked(creditAgingRepo.getReport);
const payablesAging = vi.mocked(payablesAgingRepo.getReport);
const exportsApi = vi.mocked(apiExports);

function renderPage(component: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}>{component}</QueryClientProvider>);
  return client;
}

const agingFixture = {
  asOf: '2026-06-03',
  total: 100000,
  buckets: [
    { bucket: '0-30', fromDays: 0, toDays: 30, amount: 60000, count: 4 },
    { bucket: '31-60', fromDays: 31, toDays: 60, amount: 40000, count: 2 },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  cleanup();
  useAppStore.setState({ toasts: [] });
  creditAging.mockResolvedValue(agingFixture);
  payablesAging.mockResolvedValue({
    asOf: '2026-06-03',
    total: 0,
    buckets: [{ bucket: 'Current', fromDays: 0, toDays: null, amount: 0, count: 0 }],
  });
  exportsApi.list.mockResolvedValue([
    {
      id: 'export-1',
      createdAt: '2026-06-03T08:00:00.000Z',
      exportType: 'reports.overview',
      format: 'pdf',
      status: 'ready',
      verificationLevel: 'ltv',
      verificationToken: 'token-1',
      expiresAt: '2026-06-10T08:00:00.000Z',
    },
    {
      id: 'export-2',
      createdAt: '2026-06-03T08:10:00.000Z',
      exportType: 'reports.stock-loss',
      format: 'csv',
      status: 'failed',
      verificationLevel: 'basic',
      verificationToken: 'token-2',
      expiresAt: null,
    },
    {
      id: 'export-3',
      createdAt: '2026-06-03T08:20:00.000Z',
      exportType: 'tables.any',
      format: 'csv',
      status: 'queued',
      verificationLevel: 'signed',
      verificationToken: 'token-3',
      expiresAt: null,
    },
  ] as never);
  exportsApi.download.mockResolvedValue(undefined as never);
  exportsApi.downloadVerificationReceipt.mockResolvedValue(undefined as never);
});

afterEach(cleanup);

describe('aging report pages', () => {
  test('CreditAgingPage renders summary cards, bar rows, table totals, and infinity ranges', async () => {
    creditAging.mockResolvedValue({
      ...agingFixture,
      buckets: [...agingFixture.buckets, { bucket: '90+', fromDays: 90, toDays: null, amount: 0, count: 1 }],
    });

    renderPage(<CreditAgingPage />);

    expect(await screen.findByText('Credit Aging')).toBeInTheDocument();
    expect(screen.getByText('Total Outstanding')).toBeInTheDocument();
    expect(screen.getByText('2026-06-03')).toBeInTheDocument();
    expect(screen.getAllByText('7').length).toBeGreaterThan(0);
    expect(screen.getByText('90–∞ days')).toBeInTheDocument();
    expect(screen.getByText('100%')).toBeInTheDocument();
  });

  test('PayablesAgingPage renders zero-total buckets without NaN percentages', async () => {
    renderPage(<PayablesAgingPage />);

    expect(await screen.findByText('Payables Aging')).toBeInTheDocument();
    expect(screen.getByText('Total Invoices')).toBeInTheDocument();
    expect(screen.getByText('0.0%')).toBeInTheDocument();
    expect(screen.getByText('0–∞ days')).toBeInTheDocument();
  });

  test('aging pages expose loading and error states', async () => {
    creditAging.mockReturnValue(new Promise(() => {}) as never);
    renderPage(<CreditAgingPage />);
    expect(screen.getByText(/Table loading 4/i)).toBeInTheDocument();
    cleanup();

    payablesAging.mockRejectedValue(new Error('Aging API unavailable'));
    renderPage(<PayablesAgingPage />);
    expect(await screen.findByText('Aging API unavailable')).toBeInTheDocument();
  });
});

describe('ExportsPage', () => {
  test('renders export history rows with status and verification badges', async () => {
    renderPage(<ExportsPage />);

    expect(await screen.findByText('Exports')).toBeInTheDocument();
    expect(screen.getByText('reports.overview')).toBeInTheDocument();
    expect(screen.getByText('reports.stock-loss')).toBeInTheDocument();
    expect(screen.getByText('queued')).toBeInTheDocument();
    expect(screen.getByText('ltv')).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: /Verify/i })[0]).toHaveAttribute('href', '/verify/token-1');
  });

  test('downloads ready exports, downloads PDF receipts, and reports failed downloads', async () => {
    renderPage(<ExportsPage />);

    await screen.findByText('reports.overview');
    fireEvent.click(screen.getAllByRole('button', { name: /Download/i })[0]);
    fireEvent.click(screen.getAllByRole('button', { name: 'Receipt' })[0]);

    await waitFor(() =>
      expect(exportsApi.download).toHaveBeenCalledWith(expect.objectContaining({ id: 'export-1' })),
    );
    expect(exportsApi.downloadVerificationReceipt).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'export-1' }),
    );

    exportsApi.download.mockRejectedValueOnce(new Error('Download failed hard') as never);
    cleanup();
    exportsApi.list.mockResolvedValueOnce([
      {
        id: 'export-4',
        createdAt: '2026-06-03T08:00:00.000Z',
        exportType: 'reports.profitability',
        format: 'pdf',
        status: 'ready',
        verificationLevel: 'basic',
        verificationToken: 'token-4',
        expiresAt: null,
      },
    ] as never);
    renderPage(<ExportsPage />);

    await screen.findByText('reports.profitability');
    fireEvent.click(screen.getByRole('button', { name: /Download/i }));
    await waitFor(() =>
      expect(useAppStore.getState().toasts.at(-1)).toMatchObject({
        message: 'Download failed hard',
        type: 'error',
      }),
    );
  });

  test('shows an empty-state row and supports manual refresh', async () => {
    exportsApi.list.mockResolvedValueOnce([] as never);
    renderPage(<ExportsPage />);

    expect(await screen.findByText('No exports yet.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Refresh/i }));

    await waitFor(() => expect(exportsApi.list).toHaveBeenCalledTimes(2));
  });
});
