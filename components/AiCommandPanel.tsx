import React, { useRef, useEffect, useState, useSyncExternalStore } from 'react';
import {
  X,
  Maximize2,
  Minimize2,
  Send,
  Trash2,
  AlertTriangle,
  Table,
  BarChart3,
  Sparkles,
  Bot,
  User as UserIcon,
  FileDown,
  Mail,
  Loader2,
  CheckCircle2,
  XCircle,
  ClipboardCheck,
  Pencil,
  TrendingUp,
  TrendingDown,
  Minus,
  Info,
  WifiOff,
} from 'lucide-react';
import { useLocation } from 'react-router-dom';
import { useAppStore } from '../store';
import { useAiChat, type ChatMessage, type ResponseCard } from '../lib/hooks/useAiChat';
import { useTranslation } from 'react-i18next';
import { apiExports } from '../lib/api/exports';

// ---------------------------------------------------------------------------
// Quick-action chips by page context
// ---------------------------------------------------------------------------

const CHIPS_BY_PAGE: Record<string, string[]> = {
  '/app/dashboard': [
    "Today's sales summary",
    'Low stock alerts',
    'Revenue vs yesterday',
    'Forecast demand for all products',
    'Project cash flow for next 2 weeks',
    'Sales trend this month vs last',
  ],
  '/app/sales': [
    'Top products this week',
    'Credit sales breakdown',
    'Sales by shift',
    "Today's revenue",
    'Analyze pricing performance',
    'Sales trend analysis',
  ],
  '/app/inventory': [
    'Tank levels summary',
    'Variance report',
    'Products below reorder',
    'When should I reorder diesel?',
    'Demand forecast for all tanks',
  ],
  '/app/expenses': [
    "This month's expenses",
    'Expenses by category',
    'Pending entries',
    'Log an expense for maintenance',
    'Expense trend this month vs last',
  ],
  '/app/shifts': [
    'Open shifts',
    'Average shift duration',
    'Unreconciled shifts',
    'Staffing recommendations by shift',
    'Which days need more staff?',
  ],
  '/app/deliveries': [
    'Pending deliveries',
    'Received this week',
    'Delivery schedule',
    'Create a delivery order for diesel',
    'Delivery trend analysis',
  ],
  '/app/credit': [
    'Overdue invoices',
    'Top credit customers',
    'Outstanding balance total',
    'Record customer payment',
    'Credit trend this month vs last',
  ],
  '/app/reports': [
    'Generate overview report PDF',
    'Generate profitability report',
    'Email daily operations report',
    'Generate stock loss report CSV',
    'Credit cashflow report',
    'Station comparison report',
  ],
};

function getChipsForPath(pathname: string): string[] {
  for (const [prefix, chips] of Object.entries(CHIPS_BY_PAGE)) {
    if (pathname.startsWith(prefix)) return chips;
  }
  return CHIPS_BY_PAGE['/app/dashboard'];
}

// ---------------------------------------------------------------------------
// Online status hook
// ---------------------------------------------------------------------------

function subscribeOnline(cb: () => void) {
  window.addEventListener('online', cb);
  window.addEventListener('offline', cb);
  return () => {
    window.removeEventListener('online', cb);
    window.removeEventListener('offline', cb);
  };
}

function getOnlineSnapshot() {
  return navigator.onLine;
}

function useOnlineStatus() {
  return useSyncExternalStore(subscribeOnline, getOnlineSnapshot, () => true);
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

const AlertCard: React.FC<{ card: ResponseCard }> = ({ card }) => {
  const items = Array.isArray(card.content) ? card.content : [];
  return (
    <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-xl p-3 text-sm">
      <div className="flex items-center gap-2 text-amber-700 dark:text-amber-400 font-bold text-xs uppercase tracking-wider mb-2">
        <AlertTriangle size={14} />
        {card.title}
      </div>
      <div className="space-y-1.5">
        {items.map((item: Record<string, unknown>, i: number) => (
          <div key={i} className="text-amber-800 dark:text-amber-300 text-xs">
            {Object.entries(item)
              .map(([k, v]) => `${k}: ${v}`)
              .join(' · ')}
          </div>
        ))}
      </div>
    </div>
  );
};

const TableCard: React.FC<{ card: ResponseCard }> = ({ card }) => {
  const rows = Array.isArray(card.content) ? (card.content as Record<string, unknown>[]) : [];
  if (rows.length === 0) return null;
  const cols = Object.keys(rows[0]);
  return (
    <div className="border border-border rounded-xl overflow-hidden text-xs">
      <div className="px-3 py-2 bg-muted/50 font-bold text-[10px] uppercase tracking-widest flex items-center gap-1.5">
        <Table size={12} />
        {card.title.replace('query_', '').replace(/_/g, ' ')}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-muted/30 text-[10px] uppercase tracking-wider text-muted-foreground">
            <tr>
              {cols.map((col) => (
                <th key={col} className="px-2 py-1.5 text-left font-bold">
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border/50">
            {rows.slice(0, 20).map((row, i) => (
              <tr key={i} className="hover:bg-muted/20">
                {cols.map((col) => (
                  <td key={col} className="px-2 py-1.5 whitespace-nowrap">
                    {String(row[col] ?? '-')}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

const DataCard: React.FC<{ card: ResponseCard }> = ({ card }) => {
  const data = card.content as Record<string, unknown> | undefined;
  if (!data) return null;
  return (
    <div className="border border-border rounded-xl p-3 text-xs">
      <div className="font-bold text-[10px] uppercase tracking-widest flex items-center gap-1.5 mb-2">
        <BarChart3 size={12} />
        {card.title.replace('query_', '').replace(/_/g, ' ')}
      </div>
      <div className="grid grid-cols-2 gap-2">
        {Object.entries(data)
          .filter(([, v]) => !Array.isArray(v))
          .map(([k, v]) => (
            <div key={k}>
              <div className="text-muted-foreground text-[10px] uppercase">{k}</div>
              <div className="font-bold">
                {typeof v === 'number' ? v.toLocaleString() : String(v)}
              </div>
            </div>
          ))}
      </div>
      {Object.entries(data)
        .filter(([, v]) => Array.isArray(v))
        .map(([k, v]) => (
          <div key={k} className="mt-2">
            <TableCard card={{ type: 'table', title: k, content: v }} />
          </div>
        ))}
    </div>
  );
};

const DownloadCard: React.FC<{ card: ResponseCard }> = ({ card }) => {
  const { t } = useTranslation();
  const data = card.content as Record<string, unknown> | undefined;
  const [status, setStatus] = useState<string>((data?.status as string) ?? 'queued');
  const [polling, setPolling] = useState(true);
  const exportId = data?.exportId as string | undefined;
  const format = (data?.format as string) ?? 'pdf';
  const reportType = ((data?.reportType as string) ?? '')
    .replace('reports.', '')
    .replace(/-/g, ' ');
  const emailRecipient = data?.emailRecipient as string | undefined;

  useEffect(() => {
    if (!exportId || status === 'ready' || status === 'failed') {
      setPolling(false);
      return;
    }
    let cancelled = false;
    const poll = async () => {
      try {
        const record = await apiExports.getById(exportId);
        if (!cancelled) {
          setStatus(record.status);
          if (record.status === 'ready' || record.status === 'failed') setPolling(false);
        }
      } catch {
        if (!cancelled) setPolling(false);
      }
    };
    const timer = setInterval(poll, 2000);
    const initial = setTimeout(poll, 1000);
    return () => {
      cancelled = true;
      clearInterval(timer);
      clearTimeout(initial);
    };
  }, [exportId, status]);

  const handleDownload = async () => {
    if (!exportId) return;
    try {
      const record = await apiExports.getById(exportId);
      await apiExports.download(record);
    } catch {
      // Download failed silently
    }
  };

  const icon = emailRecipient ? <Mail size={14} /> : <FileDown size={14} />;
  const statusIcon =
    status === 'ready' ? (
      <CheckCircle2 size={14} className="text-emerald-500" />
    ) : status === 'failed' ? (
      <XCircle size={14} className="text-destructive" />
    ) : polling ? (
      <Loader2 size={14} className="animate-spin text-primary" />
    ) : null;

  return (
    <div className="border border-border rounded-xl p-3 text-xs bg-primary/5">
      <div className="flex items-center justify-between mb-2">
        <div className="font-bold text-[10px] uppercase tracking-widest flex items-center gap-1.5">
          {icon}
          {reportType || t('ai.report')}
        </div>
        {statusIcon}
      </div>
      <div className="space-y-1 text-muted-foreground">
        <div className="flex justify-between">
          <span>{t('ai.reportFormat')}</span>
          <span className="font-bold text-foreground uppercase">{format}</span>
        </div>
        <div className="flex justify-between">
          <span>{t('ai.reportStatus')}</span>
          <span
            className={`font-bold ${status === 'ready' ? 'text-emerald-600' : status === 'failed' ? 'text-destructive' : 'text-foreground'}`}
          >
            {status === 'ready'
              ? t('ai.reportReady')
              : status === 'failed'
                ? t('ai.reportFailed')
                : t('ai.reportGenerating')}
          </span>
        </div>
        {emailRecipient && (
          <div className="flex justify-between">
            <span>{t('ai.reportEmailTo')}</span>
            <span className="font-bold text-foreground">{emailRecipient}</span>
          </div>
        )}
      </div>
      {status === 'ready' && (
        <button
          onClick={handleDownload}
          className="mt-2 w-full flex items-center justify-center gap-1.5 px-3 py-2 bg-primary text-primary-foreground rounded-lg text-xs font-bold hover:opacity-90 transition-opacity"
        >
          <FileDown size={12} />
          {t('ai.downloadReport')}
        </button>
      )}
    </div>
  );
};

// Field labels for confirmation cards
const CONFIRM_FIELD_LABELS: Record<string, string> = {
  deliveryNote: 'Delivery Note',
  orderedQty: 'Ordered Qty (L)',
  expectedDate: 'Expected Date',
  vehicleNo: 'Vehicle No.',
  driverName: 'Driver',
  _productName: 'Product',
  _customerName: 'Customer',
  category: 'Category',
  amount: 'Amount (TZS)',
  vendor: 'Vendor',
  paymentMethod: 'Payment Method',
  method: 'Payment Method',
  description: 'Description',
  billableDepartment: 'Department',
  paymentDate: 'Payment Date',
  referenceNo: 'Reference No.',
};

const HIDDEN_FIELDS = new Set(['branchId', 'companyId', 'productId', 'supplierId', 'customerId']);

const ConfirmationCard: React.FC<{
  card: ResponseCard;
  onConfirm: (action: string, payload: Record<string, unknown>) => Promise<void>;
}> = ({ card, onConfirm }) => {
  const { t } = useTranslation();
  const data = card.content as Record<string, unknown> | undefined;
  const action = data?.action as string;
  const originalPayload = (data?.payload ?? {}) as Record<string, unknown>;
  const [payload, setPayload] = useState<Record<string, unknown>>(originalPayload);
  const [editing, setEditing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);

  const editableFields = Object.entries(payload).filter(
    ([k]) => !HIDDEN_FIELDS.has(k) && !k.startsWith('_'),
  );

  const displayFields = Object.entries(payload).filter(([k]) => !HIDDEN_FIELDS.has(k));

  const handleFieldChange = (key: string, value: string) => {
    setPayload((prev) => ({ ...prev, [key]: value }));
  };

  const handleConfirm = async () => {
    setSubmitting(true);
    try {
      // Strip display-only fields before sending
      const cleanPayload = Object.fromEntries(
        Object.entries(payload).filter(([k]) => !k.startsWith('_')),
      );
      await onConfirm(action, cleanPayload);
      setResult({ success: true, message: t('ai.confirmSuccess') });
    } catch (err) {
      setResult({
        success: false,
        message: (err as Error).message || t('ai.confirmFailed'),
      });
    } finally {
      setSubmitting(false);
    }
  };

  if (result) {
    return (
      <div
        className={`border rounded-xl p-3 text-xs ${
          result.success
            ? 'border-emerald-300 bg-emerald-50 dark:bg-emerald-950/30'
            : 'border-destructive bg-destructive/10'
        }`}
      >
        <div className="flex items-center gap-2">
          {result.success ? (
            <CheckCircle2 size={14} className="text-emerald-600" />
          ) : (
            <XCircle size={14} className="text-destructive" />
          )}
          <span
            className={`font-bold ${result.success ? 'text-emerald-700 dark:text-emerald-400' : 'text-destructive'}`}
          >
            {result.message}
          </span>
        </div>
      </div>
    );
  }

  const actionLabel =
    action === 'create_delivery'
      ? t('ai.confirmDelivery')
      : action === 'create_expense'
        ? t('ai.confirmExpense')
        : t('ai.confirmPayment');

  return (
    <div className="border border-primary/30 rounded-xl p-3 text-xs bg-primary/5">
      <div className="flex items-center justify-between mb-3">
        <div className="font-bold text-[10px] uppercase tracking-widest flex items-center gap-1.5 text-primary">
          <ClipboardCheck size={14} />
          {actionLabel}
        </div>
        {!editing && !submitting && (
          <button
            onClick={() => setEditing(true)}
            className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
          >
            <Pencil size={10} />
            {t('ai.edit')}
          </button>
        )}
      </div>

      {editing ? (
        <div className="space-y-2 mb-3">
          {editableFields.map(([key, val]) => (
            <div key={key}>
              <label className="text-[10px] text-muted-foreground uppercase font-bold block mb-0.5">
                {CONFIRM_FIELD_LABELS[key] || key}
              </label>
              <input
                type={typeof val === 'number' ? 'number' : 'text'}
                value={String(val ?? '')}
                onChange={(e) => handleFieldChange(key, e.target.value)}
                className="w-full px-2 py-1.5 bg-background border border-input rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-primary/30"
              />
            </div>
          ))}
          <button
            onClick={() => setEditing(false)}
            className="text-[10px] text-primary font-bold hover:underline"
          >
            {t('ai.doneEditing')}
          </button>
        </div>
      ) : (
        <div className="space-y-1 mb-3">
          {displayFields.map(([key, val]) => (
            <div key={key} className="flex justify-between text-muted-foreground">
              <span>{CONFIRM_FIELD_LABELS[key] || key}</span>
              <span className="font-bold text-foreground">
                {typeof val === 'number' ? val.toLocaleString() : String(val ?? '-')}
              </span>
            </div>
          ))}
        </div>
      )}

      <div className="flex gap-2">
        <button
          onClick={handleConfirm}
          disabled={submitting || editing}
          className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-primary text-primary-foreground rounded-lg text-xs font-bold hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          {submitting ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle2 size={12} />}
          {submitting ? t('ai.submitting') : t('ai.confirm')}
        </button>
      </div>
    </div>
  );
};

const ForecastCard: React.FC<{ card: ResponseCard }> = ({ card }) => {
  const { t } = useTranslation();
  const data = card.content as Record<string, unknown> | undefined;
  if (!data) return null;

  const disclaimer = (data.disclaimer as string) || t('ai.forecastDisclaimer');
  const analysisWindow = data.analysisWindow as string | undefined;
  const changes = data.changes as Record<string, unknown> | undefined;

  // Determine trend icon
  const trend = changes?.trend as string | undefined;
  const TrendIcon = trend === 'up' ? TrendingUp : trend === 'down' ? TrendingDown : Minus;
  const trendColor =
    trend === 'up'
      ? 'text-emerald-600 dark:text-emerald-400'
      : trend === 'down'
        ? 'text-red-600 dark:text-red-400'
        : 'text-muted-foreground';

  // Collect top-level scalar fields (skip arrays, objects, internal flags)
  const scalarEntries = Object.entries(data).filter(
    ([k, v]) =>
      !k.startsWith('_') &&
      k !== 'disclaimer' &&
      k !== 'analysisWindow' &&
      k !== 'changes' &&
      typeof v !== 'object',
  );

  // Collect nested objects (summary, recommendations, etc.)
  const objectEntries = Object.entries(data).filter(
    ([k, v]) =>
      !k.startsWith('_') &&
      k !== 'disclaimer' &&
      k !== 'analysisWindow' &&
      k !== 'changes' &&
      typeof v === 'object' &&
      v !== null &&
      !Array.isArray(v),
  );

  // Collect arrays (forecasts, projections, analyses)
  const arrayEntries = Object.entries(data).filter(
    ([k, v]) => !k.startsWith('_') && Array.isArray(v),
  );

  return (
    <div className="border border-indigo-200 dark:border-indigo-800 rounded-xl p-3 text-xs bg-indigo-50/50 dark:bg-indigo-950/20">
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div className="font-bold text-[10px] uppercase tracking-widest flex items-center gap-1.5 text-indigo-700 dark:text-indigo-400">
          <TrendingUp size={14} />
          {card.title
            .replace('forecast_', '')
            .replace('project_', '')
            .replace('analyze_', '')
            .replace('recommend_', '')
            .replace(/_/g, ' ')}
        </div>
        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400 uppercase tracking-wider">
          {t('ai.estimate')}
        </span>
      </div>

      {/* Analysis window */}
      {analysisWindow && (
        <div className="text-[10px] text-muted-foreground mb-2">
          {t('ai.analysisWindow')}: {analysisWindow}
        </div>
      )}

      {/* Trend change indicator */}
      {changes && (
        <div className="flex items-center gap-2 mb-2 p-2 rounded-lg bg-background/60">
          <TrendIcon size={16} className={trendColor} />
          <div>
            <span className={`font-bold text-sm ${trendColor}`}>
              {changes.valueChangePercent as number}%
            </span>
            <span className="text-muted-foreground ml-1 text-[10px]">
              {changes.trendLabel as string}
            </span>
          </div>
        </div>
      )}

      {/* Scalar fields */}
      {scalarEntries.length > 0 && (
        <div className="grid grid-cols-2 gap-2 mb-2">
          {scalarEntries.map(([k, v]) => (
            <div key={k}>
              <div className="text-muted-foreground text-[10px] uppercase">
                {k.replace(/([A-Z])/g, ' $1').trim()}
              </div>
              <div className="font-bold">
                {typeof v === 'number' ? v.toLocaleString() : String(v)}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Nested objects (summary, recommendations) */}
      {objectEntries.map(([k, v]) => (
        <div key={k} className="mb-2">
          <div className="text-[10px] text-muted-foreground uppercase font-bold mb-1">
            {k.replace(/([A-Z])/g, ' $1').trim()}
          </div>
          <div className="grid grid-cols-2 gap-1.5 p-2 rounded-lg bg-background/60">
            {Object.entries(v as Record<string, unknown>).map(([sk, sv]) => (
              <div
                key={sk}
                className={typeof sv === 'string' && sv.length > 40 ? 'col-span-2' : ''}
              >
                <div className="text-muted-foreground text-[9px] uppercase">
                  {sk.replace(/([A-Z])/g, ' $1').trim()}
                </div>
                <div className="font-bold text-[11px]">
                  {typeof sv === 'number' ? sv.toLocaleString() : String(sv ?? '-')}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}

      {/* Array data as mini-tables */}
      {arrayEntries.map(([k, v]) => {
        const items = v as Record<string, unknown>[];
        if (items.length === 0) return null;
        const cols = Object.keys(items[0]);
        return (
          <div key={k} className="mb-2">
            <div className="text-[10px] text-muted-foreground uppercase font-bold mb-1">
              {k.replace(/([A-Z])/g, ' $1').trim()}
            </div>
            <div className="overflow-x-auto rounded-lg border border-border/50">
              <table className="w-full">
                <thead className="bg-muted/30 text-[9px] uppercase tracking-wider text-muted-foreground">
                  <tr>
                    {cols.map((col) => (
                      <th key={col} className="px-2 py-1 text-left font-bold">
                        {col.replace(/([A-Z])/g, ' $1').trim()}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/30">
                  {items.slice(0, 15).map((row, i) => (
                    <tr key={i} className="hover:bg-muted/10">
                      {cols.map((col) => (
                        <td key={col} className="px-2 py-1 whitespace-nowrap">
                          {typeof row[col] === 'number'
                            ? (row[col] as number).toLocaleString()
                            : String(row[col] ?? '-')}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}

      {/* Disclaimer */}
      <div className="flex items-start gap-1.5 mt-2 p-2 rounded-lg bg-amber-50/50 dark:bg-amber-950/20 text-amber-700 dark:text-amber-400">
        <Info size={12} className="mt-0.5 flex-shrink-0" />
        <p className="text-[10px] leading-relaxed">{disclaimer}</p>
      </div>
    </div>
  );
};

const ResponseCards: React.FC<{
  cards?: ResponseCard[];
  onConfirm: (action: string, payload: Record<string, unknown>) => Promise<void>;
}> = ({ cards, onConfirm }) => {
  if (!cards?.length) return null;
  return (
    <div className="space-y-2 mt-2">
      {cards.map((card, i) => {
        switch (card.type) {
          case 'alert':
            return <AlertCard key={i} card={card} />;
          case 'table':
            return <TableCard key={i} card={card} />;
          case 'data':
            return <DataCard key={i} card={card} />;
          case 'download':
            return <DownloadCard key={i} card={card} />;
          case 'confirmation':
            return <ConfirmationCard key={i} card={card} onConfirm={onConfirm} />;
          case 'forecast':
            return <ForecastCard key={i} card={card} />;
          default:
            return null;
        }
      })}
    </div>
  );
};

const MessageBubble: React.FC<{
  msg: ChatMessage;
  onConfirm: (action: string, payload: Record<string, unknown>) => Promise<void>;
}> = ({ msg, onConfirm }) => {
  const isUser = msg.role === 'user';
  return (
    <div className={`flex gap-2 ${isUser ? 'justify-end' : 'justify-start'}`}>
      {!isUser && (
        <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
          <Bot size={14} className="text-primary" />
        </div>
      )}
      <div className={`max-w-[85%] ${isUser ? 'order-first' : ''}`}>
        <div
          className={`rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
            isUser
              ? 'bg-primary text-primary-foreground rounded-br-md'
              : 'bg-muted/60 text-foreground rounded-bl-md'
          }`}
        >
          <p className="whitespace-pre-wrap">{msg.content}</p>
        </div>
        <ResponseCards cards={msg.cards} onConfirm={onConfirm} />
      </div>
      {isUser && (
        <div className="w-7 h-7 rounded-full bg-primary flex items-center justify-center flex-shrink-0 mt-0.5">
          <UserIcon size={14} className="text-primary-foreground" />
        </div>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Main Panel
// ---------------------------------------------------------------------------

const AiCommandPanel: React.FC = () => {
  const { t } = useTranslation();
  const { isAiPanelOpen, setAiPanelOpen } = useAppStore();
  const {
    messages,
    isLoading,
    proactiveInsights,
    sendMessage,
    fetchProactiveInsights,
    clearConversation,
    confirmWrite,
  } = useAiChat();
  const location = useLocation();
  const [input, setInput] = useState('');
  const [expanded, setExpanded] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const isOnline = useOnlineStatus();

  const chips = getChipsForPath(location.pathname);

  // Fetch proactive insights when panel opens
  useEffect(() => {
    if (isAiPanelOpen) {
      fetchProactiveInsights();
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isAiPanelOpen, fetchProactiveInsights]);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Keyboard shortcut: Esc to close
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isAiPanelOpen) {
        setAiPanelOpen(false);
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isAiPanelOpen, setAiPanelOpen]);

  const handleSend = () => {
    if (!input.trim() || isLoading) return;
    sendMessage(input);
    setInput('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleChipClick = (chip: string) => {
    sendMessage(chip);
  };

  if (!isAiPanelOpen) return null;

  return (
    <div
      className={`fixed top-0 right-0 h-full z-50 bg-background border-l border-border shadow-2xl flex flex-col transition-all duration-300 animate-in slide-in-from-right-5 ${
        expanded ? 'w-full md:w-[700px]' : 'w-full md:w-[400px]'
      }`}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-background/80 backdrop-blur-sm">
        <div className="flex items-center gap-2">
          <div className="bg-primary/10 p-1.5 rounded-lg">
            <Sparkles size={16} className="text-primary" />
          </div>
          <div>
            <h2 className="text-sm font-black tracking-tight">{t('ai.title')}</h2>
            <p className="text-[10px] text-muted-foreground font-medium">{t('ai.subtitle')}</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {messages.length > 0 && (
            <button
              onClick={clearConversation}
              className="w-8 h-8 flex items-center justify-center hover:bg-muted rounded-lg text-muted-foreground transition-colors"
              title={t('ai.clearConversation')}
            >
              <Trash2 size={14} />
            </button>
          )}
          <button
            onClick={() => setExpanded(!expanded)}
            className="w-8 h-8 flex items-center justify-center hover:bg-muted rounded-lg text-muted-foreground transition-colors"
            title={expanded ? t('ai.collapse') : t('ai.expand')}
          >
            {expanded ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
          </button>
          <button
            onClick={() => setAiPanelOpen(false)}
            className="w-8 h-8 flex items-center justify-center hover:bg-muted rounded-lg text-muted-foreground transition-colors"
            title={t('ai.close')}
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {/* Offline banner */}
      {!isOnline && (
        <div className="flex items-center gap-2 px-4 py-2 bg-destructive/10 border-b border-destructive/20 text-destructive text-xs font-semibold">
          <WifiOff size={14} />
          {t('ai.offline')}
        </div>
      )}

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {/* Proactive insight cards */}
        {proactiveInsights.length > 0 && messages.length === 0 && (
          <div className="space-y-2">
            <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-widest">
              {t('ai.proactiveInsights')}
            </p>
            {proactiveInsights.map((card, i) => (
              <AlertCard key={i} card={card} />
            ))}
          </div>
        )}

        {/* Empty state */}
        {messages.length === 0 && proactiveInsights.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="bg-primary/10 p-4 rounded-2xl mb-4">
              <Sparkles size={28} className="text-primary" />
            </div>
            <h3 className="text-sm font-bold mb-1">{t('ai.emptyTitle')}</h3>
            <p className="text-xs text-muted-foreground max-w-[250px]">
              {t('ai.emptyDescription')}
            </p>
          </div>
        )}

        {/* Message bubbles */}
        {messages.map((msg, i) => (
          <MessageBubble key={i} msg={msg} onConfirm={confirmWrite} />
        ))}

        {/* Typing indicator */}
        {isLoading && (
          <div className="flex gap-2 items-start">
            <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
              <Bot size={14} className="text-primary" />
            </div>
            <div className="bg-muted/60 rounded-2xl rounded-bl-md px-4 py-3">
              <div className="flex gap-1">
                <div
                  className="w-2 h-2 bg-muted-foreground/40 rounded-full animate-bounce"
                  style={{ animationDelay: '0ms' }}
                />
                <div
                  className="w-2 h-2 bg-muted-foreground/40 rounded-full animate-bounce"
                  style={{ animationDelay: '150ms' }}
                />
                <div
                  className="w-2 h-2 bg-muted-foreground/40 rounded-full animate-bounce"
                  style={{ animationDelay: '300ms' }}
                />
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Quick-action chips */}
      {messages.length === 0 && (
        <div className="px-4 pb-2">
          <div className="flex flex-wrap gap-1.5">
            {chips.map((chip) => (
              <button
                key={chip}
                onClick={() => handleChipClick(chip)}
                disabled={isLoading}
                className="px-3 py-1.5 text-[11px] font-semibold bg-muted hover:bg-muted/80 rounded-full text-foreground transition-colors disabled:opacity-50"
              >
                {chip}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Input area */}
      <div className="px-4 py-3 border-t border-border bg-background/80 backdrop-blur-sm">
        <div className="flex items-center gap-2">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={t('ai.inputPlaceholder')}
            disabled={isLoading || !isOnline}
            maxLength={2000}
            className="flex-1 px-4 py-2.5 bg-muted/50 border border-input rounded-xl text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50 transition-all disabled:opacity-50"
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || isLoading || !isOnline}
            className="w-10 h-10 flex items-center justify-center bg-primary text-primary-foreground rounded-xl hover:opacity-90 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
          >
            <Send size={16} />
          </button>
        </div>
      </div>
    </div>
  );
};

export default AiCommandPanel;
