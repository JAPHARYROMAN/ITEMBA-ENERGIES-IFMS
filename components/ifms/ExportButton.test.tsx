import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { ExportButton } from './ExportButton';

const storeMocks = vi.hoisted(() => ({
  user: null as null | { permissions: string[] },
  addToast: vi.fn(),
}));

const apiMocks = vi.hoisted(() => ({
  create: vi.fn(),
  getById: vi.fn(),
  download: vi.fn(),
  verifyUrl: vi.fn((token: string) => `/verify/${token}`),
  publicReceiptUrl: vi.fn((token: string) => `/receipt/${token}`),
}));

vi.mock('../../store', () => ({
  useAppStore: () => ({ addToast: storeMocks.addToast }),
  useAuthStore: () => ({ user: storeMocks.user }),
  hasPermission: (user: { permissions?: string[] } | null | undefined, permission: string) =>
    Boolean(user?.permissions?.includes(permission)),
}));

vi.mock('../../lib/api/exports', () => ({
  apiExports: {
    create: apiMocks.create,
    getById: apiMocks.getById,
    download: apiMocks.download,
    verifyUrl: apiMocks.verifyUrl,
    publicReceiptUrl: apiMocks.publicReceiptUrl,
  },
}));

const queuedRecord = {
  id: 'export-1',
  status: 'queued',
  format: 'pdf',
  verificationToken: 'token-1',
};

const readyPdfRecord = {
  ...queuedRecord,
  status: 'ready',
  fileName: 'overview.pdf',
  verificationLevel: 'signed',
};

describe('ExportButton', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    storeMocks.user = { permissions: ['reports:read'] };
    storeMocks.addToast.mockClear();
    apiMocks.create.mockClear();
    apiMocks.getById.mockClear();
    apiMocks.download.mockClear();
    apiMocks.create.mockResolvedValue(queuedRecord);
    apiMocks.getById.mockResolvedValue(readyPdfRecord);
    apiMocks.download.mockResolvedValue(undefined);
    apiMocks.verifyUrl.mockClear();
    apiMocks.publicReceiptUrl.mockClear();
  });

  afterEach(() => {
    cleanup();
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  test('does not render for users without report export permission', () => {
    storeMocks.user = { permissions: [] };

    render(<ExportButton exportType="reports.overview" />);

    expect(screen.queryByRole('button', { name: 'Export' })).not.toBeInTheDocument();
  });

  test('queues a PDF export, polls until ready, downloads it, and shows verification toasts', async () => {
    render(<ExportButton exportType="reports.overview" params={{ stationId: 'station-1' }} label="Export Pack" />);

    fireEvent.click(screen.getByRole('button', { name: 'Export Pack' }));
    fireEvent.click(screen.getByRole('button', { name: 'Export PDF' }));

    await act(async () => {
      await Promise.resolve();
    });

    expect(apiMocks.create).toHaveBeenCalledWith({
      format: 'pdf',
      exportType: 'reports.overview',
      params: { stationId: 'station-1' },
      clientContext: expect.objectContaining({
        requestedFromUrl: '',
        timezone: expect.any(String),
      }),
    });
    expect(storeMocks.addToast).toHaveBeenCalledWith('Export queued. Preparing file...', 'info');

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });

    expect(apiMocks.getById).toHaveBeenCalledWith('export-1');
    expect(apiMocks.download).toHaveBeenCalledWith(readyPdfRecord);
    expect(storeMocks.addToast).toHaveBeenCalledWith('Export ready (Signed (PAdES))', 'success', {
      label: 'Verify Report',
      href: '/verify/token-1',
    });
    expect(storeMocks.addToast).toHaveBeenCalledWith(
      'Download verification receipt for compliance filing.',
      'info',
      { label: 'Receipt', href: '/receipt/token-1' },
    );
  });

  test('shows failure toast when the queued export fails during polling', async () => {
    apiMocks.getById.mockResolvedValue({ ...queuedRecord, status: 'failed' });

    render(<ExportButton exportType="reports.stock-loss" />);

    fireEvent.click(screen.getByRole('button', { name: 'Export' }));
    fireEvent.click(screen.getByRole('button', { name: 'Export CSV' }));

    await act(async () => {
      await Promise.resolve();
      await vi.advanceTimersByTimeAsync(1000);
    });

    expect(storeMocks.addToast).toHaveBeenCalledWith('Export failed. Please retry.', 'error');
    expect(apiMocks.download).not.toHaveBeenCalled();
  });

  test('shows fallback queue error when create fails without a message', async () => {
    apiMocks.create.mockRejectedValue({});

    render(<ExportButton exportType="reports.profitability" />);

    fireEvent.click(screen.getByRole('button', { name: 'Export' }));
    fireEvent.click(screen.getByRole('button', { name: 'Export CSV' }));

    await act(async () => {
      await Promise.resolve();
    });

    expect(storeMocks.addToast).toHaveBeenCalledWith('Failed to queue export', 'error');
  });
});
