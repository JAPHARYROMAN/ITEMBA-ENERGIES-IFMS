import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { ChatMessage, ResponseCard } from '../lib/hooks/useAiChat';
import AiCommandPanel from './AiCommandPanel';

const storeMocks = vi.hoisted(() => ({
  current: { isAiPanelOpen: true },
  setAiPanelOpen: vi.fn(),
}));

const aiMocks = vi.hoisted(() => ({
  current: {
    messages: [] as ChatMessage[],
    isLoading: false,
    proactiveInsights: [] as ResponseCard[],
  },
  sendMessage: vi.fn(),
  fetchProactiveInsights: vi.fn(),
  clearConversation: vi.fn(),
  confirmWrite: vi.fn(),
}));

const exportMocks = vi.hoisted(() => ({
  getById: vi.fn(),
  download: vi.fn(),
}));

vi.mock('../store', () => ({
  useAppStore: () => ({
    isAiPanelOpen: storeMocks.current.isAiPanelOpen,
    setAiPanelOpen: storeMocks.setAiPanelOpen,
  }),
}));

vi.mock('../lib/hooks/useAiChat', () => ({
  useAiChat: () => ({
    messages: aiMocks.current.messages,
    isLoading: aiMocks.current.isLoading,
    proactiveInsights: aiMocks.current.proactiveInsights,
    sendMessage: aiMocks.sendMessage,
    fetchProactiveInsights: aiMocks.fetchProactiveInsights,
    clearConversation: aiMocks.clearConversation,
    confirmWrite: aiMocks.confirmWrite,
  }),
}));

vi.mock('../lib/api/exports', () => ({
  apiExports: {
    getById: exportMocks.getById,
    download: exportMocks.download,
  },
}));

function setOnline(value: boolean) {
  Object.defineProperty(window.navigator, 'onLine', {
    configurable: true,
    value,
  });
}

function renderPanel(path = '/app/dashboard') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AiCommandPanel />
    </MemoryRouter>,
  );
}

describe('AiCommandPanel', () => {
  beforeEach(() => {
    storeMocks.current = { isAiPanelOpen: true };
    storeMocks.setAiPanelOpen.mockClear();
    aiMocks.current = { messages: [], isLoading: false, proactiveInsights: [] };
    aiMocks.sendMessage.mockReset();
    aiMocks.sendMessage.mockResolvedValue(undefined);
    aiMocks.fetchProactiveInsights.mockReset();
    aiMocks.fetchProactiveInsights.mockResolvedValue(undefined);
    aiMocks.clearConversation.mockClear();
    aiMocks.confirmWrite.mockReset();
    aiMocks.confirmWrite.mockResolvedValue({ success: true, message: 'Created successfully' });
    exportMocks.getById.mockReset();
    exportMocks.download.mockReset();
    exportMocks.getById.mockResolvedValue({
      id: 'export-1',
      status: 'ready',
      format: 'pdf',
      fileName: 'overview.pdf',
    });
    exportMocks.download.mockResolvedValue(undefined);
    Element.prototype.scrollIntoView = vi.fn();
    setOnline(true);
  });

  afterEach(() => {
    cleanup();
    setOnline(true);
    vi.useRealTimers();
  });

  test('does not render when the panel is closed', () => {
    storeMocks.current = { isAiPanelOpen: false };

    renderPanel();

    expect(screen.queryByText('IFMS Command')).not.toBeInTheDocument();
  });

  test('opens with contextual chips and sends chip or typed prompts', async () => {
    renderPanel('/app/inventory');

    expect(await screen.findByText('IFMS Command')).toBeInTheDocument();
    expect(aiMocks.fetchProactiveInsights).toHaveBeenCalled();
    expect(screen.getByText('How can I help?')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Tank levels summary' }));
    expect(aiMocks.sendMessage).toHaveBeenCalledWith('Tank levels summary');

    const input = screen.getByPlaceholderText('Ask anything about your station...');
    fireEvent.change(input, { target: { value: 'Show sales today' } });
    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });

    expect(aiMocks.sendMessage).toHaveBeenCalledWith('Show sales today');
    expect(input).toHaveValue('');

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(storeMocks.setAiPanelOpen).toHaveBeenCalledWith(false);
  });

  test('falls back to dashboard chips, ignores blocked sends, and reacts to online events', async () => {
    renderPanel('/app/unknown-section');

    expect(await screen.findByText("Today's sales summary")).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: "Today's sales summary" }));
    expect(aiMocks.sendMessage).toHaveBeenCalledWith("Today's sales summary");

    aiMocks.sendMessage.mockClear();
    const input = screen.getByPlaceholderText('Ask anything about your station...');
    fireEvent.change(input, { target: { value: '   ' } });
    expect(input.parentElement?.querySelector('button')).toBeDisabled();
    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });
    expect(aiMocks.sendMessage).not.toHaveBeenCalled();

    act(() => {
      setOnline(false);
      window.dispatchEvent(new Event('offline'));
    });
    expect(await screen.findByText(/AI is unavailable/)).toBeInTheDocument();
    expect(input).toBeDisabled();

    act(() => {
      setOnline(true);
      window.dispatchEvent(new Event('online'));
    });
    await waitFor(() => expect(input).not.toBeDisabled());
  });

  test('renders proactive insights before a conversation starts', async () => {
    aiMocks.current.proactiveInsights = [
      {
        type: 'alert',
        title: 'Low diesel stock',
        content: [{ tank: 'Diesel 1', level: '12%' }],
      },
    ];

    renderPanel();

    expect(await screen.findByText('Attention Needed')).toBeInTheDocument();
    expect(screen.getByText('Low diesel stock')).toBeInTheDocument();
    expect(screen.getByText('tank: Diesel 1 · level: 12%')).toBeInTheDocument();
  });

  test('renders card fallback states for empty and unknown card content', async () => {
    aiMocks.current.messages = [
      {
        role: 'assistant',
        content: 'Some cards have no visible content.',
        cards: [
          { type: 'table', title: 'query_empty', content: [] },
          { type: 'data', title: 'query_missing', content: undefined },
          { type: 'forecast', title: 'forecast_missing', content: undefined },
          { type: 'unknown' as ResponseCard['type'], title: 'ignored', content: { value: 1 } },
        ],
      },
    ];

    renderPanel();

    expect(await screen.findByText('Some cards have no visible content.')).toBeInTheDocument();
    expect(screen.queryByText('query_empty')).not.toBeInTheDocument();
    expect(screen.queryByText('ignored')).not.toBeInTheDocument();
  });

  test('renders messages, response cards, confirmation, download, and header actions', async () => {
    aiMocks.current.messages = [
      { role: 'user', content: 'Show alerts' },
      {
        role: 'assistant',
        content: 'Here is the operating summary.',
        cards: [
          { type: 'alert', title: 'Critical variance', content: [{ station: 'North', variance: 7 }] },
          { type: 'table', title: 'query_sales_by_shift', content: [{ shift: 'Morning', total: 1200 }] },
          {
            type: 'data',
            title: 'query_financial_summary',
            content: { revenue: 1500, expenses: 400, rows: [{ method: 'cash', amount: 1000 }] },
          },
          {
            type: 'forecast',
            title: 'forecast_demand',
            content: {
              analysisWindow: '7 days',
              projectedLiters: 4200,
              changes: { trend: 'up', valueChangePercent: 8, trendLabel: 'higher demand' },
              recommendation: { action: 'Reorder diesel' },
            },
          },
          {
            type: 'download',
            title: 'reports.overview',
            content: {
              exportId: 'export-1',
              format: 'pdf',
              reportType: 'reports.overview',
              status: 'ready',
            },
          },
          {
            type: 'confirmation',
            title: 'confirm_expense',
            content: {
              action: 'create_expense',
              payload: {
                category: 'Maintenance',
                amount: 100,
                description: 'Pump repair',
                branchId: 'hidden-branch',
                _productName: 'Display only',
              },
            },
          },
        ],
      },
      { role: 'assistant', content: 'Sorry, I encountered an error. Timeout' },
    ];

    renderPanel();

    expect(await screen.findByText('Show alerts')).toBeInTheDocument();
    expect(screen.getByText('Here is the operating summary.')).toBeInTheDocument();
    expect(screen.getByText('Sorry, I encountered an error. Timeout')).toBeInTheDocument();
    expect(screen.getByText('Critical variance')).toBeInTheDocument();
    expect(screen.getByText('Morning')).toBeInTheDocument();
    expect(screen.getByText('financial summary')).toBeInTheDocument();
    expect(screen.getByText('projected Liters')).toBeInTheDocument();
    expect(screen.getByText('Confirm Expense')).toBeInTheDocument();
    expect(screen.queryByText('hidden-branch')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Download Report' }));
    await waitFor(() => {
      expect(exportMocks.getById).toHaveBeenCalledWith('export-1');
      expect(exportMocks.download).toHaveBeenCalled();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Confirm & Submit' }));
    await waitFor(() => {
      expect(aiMocks.confirmWrite).toHaveBeenCalledWith('create_expense', {
        category: 'Maintenance',
        amount: 100,
        description: 'Pump repair',
        branchId: 'hidden-branch',
      });
      expect(screen.getByText('Successfully submitted!')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTitle('Clear conversation'));
    expect(aiMocks.clearConversation).toHaveBeenCalled();

    fireEvent.click(screen.getByTitle('Expand panel'));
    expect(screen.getByTitle('Collapse panel')).toBeInTheDocument();

    fireEvent.click(screen.getByTitle('Close'));
    expect(storeMocks.setAiPanelOpen).toHaveBeenCalledWith(false);
  });

  test('renders download status variants, email recipients, and missing export fallbacks', async () => {
    aiMocks.current.messages = [
      {
        role: 'assistant',
        content: 'Report jobs',
        cards: [
          {
            type: 'download',
            title: 'email_report',
            content: {
              exportId: 'failed-export',
              format: 'csv',
              reportType: 'reports.stock-loss',
              status: 'failed',
              emailRecipient: 'ops@itemba.test',
            },
          },
          {
            type: 'download',
            title: 'fallback_report',
            content: {},
          },
        ],
      },
    ];

    renderPanel();

    expect(await screen.findByText('Report jobs')).toBeInTheDocument();
    expect(screen.getByText('stock loss')).toBeInTheDocument();
    expect(screen.getByText('csv')).toBeInTheDocument();
    expect(screen.getByText('Failed')).toBeInTheDocument();
    expect(screen.getByText('ops@itemba.test')).toBeInTheDocument();
    expect(screen.getByText('Report')).toBeInTheDocument();
    expect(exportMocks.getById).not.toHaveBeenCalled();
  });

  test('polls queued downloads and stops polling when the export fails', async () => {
    exportMocks.getById.mockResolvedValueOnce({ id: 'export-2', status: 'failed' });
    aiMocks.current.messages = [
      {
        role: 'assistant',
        content: 'Queued report',
        cards: [
          {
            type: 'download',
            title: 'queued_report',
            content: {
              exportId: 'export-2',
              status: 'queued',
              format: 'pdf',
            },
          },
        ],
      },
    ];

    renderPanel();

    expect(screen.getByText('Generating...')).toBeInTheDocument();
    await waitFor(() => expect(exportMocks.getById).toHaveBeenCalledWith('export-2'), {
      timeout: 1500,
    });
    expect(await screen.findByText('Failed')).toBeInTheDocument();
  });

  test('swallows download failures from ready export cards', async () => {
    exportMocks.getById.mockRejectedValueOnce(new Error('download unavailable'));
    aiMocks.current.messages = [
      {
        role: 'assistant',
        content: 'Ready report',
        cards: [
          {
            type: 'download',
            title: 'ready_report',
            content: {
              exportId: 'export-fail',
              status: 'ready',
              format: 'pdf',
            },
          },
        ],
      },
    ];

    renderPanel();

    fireEvent.click(await screen.findByRole('button', { name: 'Download Report' }));
    await waitFor(() => expect(exportMocks.getById).toHaveBeenCalledWith('export-fail'));
    expect(exportMocks.download).not.toHaveBeenCalled();
  });

  test('edits confirmation payloads and renders failed confirmations', async () => {
    aiMocks.confirmWrite.mockRejectedValueOnce(new Error('Manager approval required'));
    aiMocks.current.messages = [
      {
        role: 'assistant',
        content: 'Please confirm this delivery.',
        cards: [
          {
            type: 'confirmation',
            title: 'confirm_delivery',
            content: {
              action: 'create_delivery',
              payload: {
                deliveryNote: 'DN-1',
                orderedQty: 1000,
                supplierId: 'supplier-hidden',
                _productName: 'Diesel',
              },
            },
          },
          {
            type: 'confirmation',
            title: 'confirm_payment',
            content: {
              action: 'record_payment',
              payload: {
                method: 'Cash',
                amount: 500,
              },
            },
          },
        ],
      },
    ];

    renderPanel();

    expect(await screen.findByText('Confirm Delivery')).toBeInTheDocument();
    expect(screen.getByText('Confirm Payment')).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole('button', { name: 'Edit' })[0]);
    fireEvent.change(screen.getByDisplayValue('DN-1'), { target: { value: 'DN-2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Done editing' }));
    fireEvent.click(screen.getAllByRole('button', { name: 'Confirm & Submit' })[0]);

    await waitFor(() =>
      expect(aiMocks.confirmWrite).toHaveBeenCalledWith('create_delivery', {
        deliveryNote: 'DN-2',
        orderedQty: 1000,
        supplierId: 'supplier-hidden',
      }),
    );
    expect(screen.getByText('Manager approval required')).toBeInTheDocument();
    expect(screen.queryByText('supplier-hidden')).not.toBeInTheDocument();
  });

  test('renders forecast trend variants and table fallbacks', async () => {
    aiMocks.current.messages = [
      {
        role: 'assistant',
        content: 'Forecast variants',
        cards: [
          {
            type: 'forecast',
            title: 'analyze_margin',
            content: {
              changes: { trend: 'down', valueChangePercent: -5, trendLabel: 'lower margin' },
              notes: {
                detail:
                  'Margins are below the weekly target because discounts increased materially.',
              },
              projectionRows: [{ dayName: 'Monday', expectedLiters: 1200 }],
              emptyRows: [],
            },
          },
          {
            type: 'forecast',
            title: 'recommend_staffing',
            content: {
              changes: { trend: 'flat', valueChangePercent: 0, trendLabel: 'stable' },
              recommendation: { nextStep: null },
            },
          },
        ],
      },
    ];

    renderPanel();

    expect(await screen.findByText('Forecast variants')).toBeInTheDocument();
    expect(screen.getByText('-5%')).toBeInTheDocument();
    expect(screen.getByText('lower margin')).toBeInTheDocument();
    expect(screen.getByText('projection Rows')).toBeInTheDocument();
    expect(screen.getByText('expected Liters')).toBeInTheDocument();
    expect(screen.getByText('stable')).toBeInTheDocument();
    expect(screen.getByText('-')).toBeInTheDocument();
  });

  test('shows typing state and disables the prompt while offline', async () => {
    aiMocks.current.isLoading = true;
    setOnline(false);

    renderPanel();

    expect(await screen.findByText(/AI is unavailable/)).toBeInTheDocument();
    const input = screen.getByPlaceholderText('Ask anything about your station...');
    expect(input).toBeDisabled();
    expect(input.parentElement?.querySelector('button')).toBeDisabled();
    expect(document.querySelectorAll('.animate-bounce')).toHaveLength(3);
  });
});
