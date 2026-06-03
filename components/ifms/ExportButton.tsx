import React from 'react';
import { FileDown, FileSpreadsheet, Loader2 } from 'lucide-react';
import { apiExports, type ExportRecord, type ExportType } from '../../lib/api/exports';
import { hasPermission, useAppStore, useAuthStore } from '../../store';
import { EXPORT_POLL_INTERVAL_MS, EXPORT_INITIAL_DELAY_MS } from '../../lib/constants';
import { getErrorMessage } from '../../lib/utils';
import { useTranslation } from 'react-i18next';

interface ExportButtonProps {
  exportType: ExportType;
  params?: Record<string, unknown>;
  className?: string;
  label?: string;
}

const BUTTON_CLASS =
  'inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-black uppercase tracking-widest border border-border bg-card text-foreground hover:bg-muted transition-colors';

const VERIFICATION_LABEL: Record<string, string> = {
  basic: 'Basic (Hash)',
  signed: 'Signed (PAdES)',
  signed_timestamped: 'Signed + Timestamped',
  ltv: 'LTV',
};

export const ExportButton: React.FC<ExportButtonProps> = ({
  exportType,
  params,
  className,
  label = 'Export',
}) => {
  const { t } = useTranslation();
  const { addToast } = useAppStore();
  const { user } = useAuthStore();
  const [open, setOpen] = React.useState(false);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const pollTimer = React.useRef<number | null>(null);
  const canExport = hasPermission(user, 'reports:read');

  const stopPolling = React.useCallback(() => {
    if (pollTimer.current) {
      window.clearTimeout(pollTimer.current);
      pollTimer.current = null;
    }
  }, []);

  React.useEffect(() => {
    return () => stopPolling();
  }, [stopPolling]);

  const queueExport = async (format: 'pdf' | 'csv') => {
    setOpen(false);
    setIsSubmitting(true);
    stopPolling();

    try {
      const created = await apiExports.create({
        format,
        exportType,
        params,
        clientContext: {
          requestedFromUrl: window.location.hash.replace(/^#/, ''),
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        },
      });

      addToast(t('exportButton.exportQueued'), 'info');

      const pollOnce = async () => {
        try {
          const current = await apiExports.getById(created.id);
          if (current.status === 'ready') {
            await onReady(current);
            setIsSubmitting(false);
            stopPolling();
            return;
          }
          if (current.status === 'failed') {
            addToast(t('exportButton.exportFailed'), 'error');
            setIsSubmitting(false);
            stopPolling();
            return;
          }
          pollTimer.current = window.setTimeout(pollOnce, EXPORT_POLL_INTERVAL_MS);
        } catch (err: unknown) {
          addToast(getErrorMessage(err, t('exportButton.pollFailed')), 'error');
          setIsSubmitting(false);
          stopPolling();
        }
      };

      pollTimer.current = window.setTimeout(pollOnce, EXPORT_INITIAL_DELAY_MS);
    } catch (err: unknown) {
      addToast(getErrorMessage(err, t('exportButton.queueFailed')), 'error');
      setIsSubmitting(false);
    }
  };

  const onReady = async (record: ExportRecord) => {
    await apiExports.download(record);
    const badge = VERIFICATION_LABEL[record.verificationLevel ?? 'basic'] ?? 'Basic (Hash)';
    addToast(t('exportButton.exportReady', { badge }), 'success', {
      label: t('exportButton.verifyReport'),
      href: apiExports.verifyUrl(record.verificationToken),
    });

    if (record.format === 'pdf') {
      addToast(t('exportButton.downloadReceipt'), 'info', {
        label: t('exportButton.receipt'),
        href: apiExports.publicReceiptUrl(record.verificationToken),
      });
    }
  };

  if (!canExport) return null;

  return (
    <div className="relative">
      <button
        type="button"
        disabled={isSubmitting}
        onClick={() => setOpen((v) => !v)}
        className={`${BUTTON_CLASS} ${className ?? ''}`}
      >
        {isSubmitting ? <Loader2 size={14} className="animate-spin" /> : <FileDown size={14} />}
        {label}
      </button>

      {open && !isSubmitting && (
        <div className="absolute right-0 mt-2 w-44 rounded-xl border border-border bg-card shadow-xl z-30 overflow-hidden">
          <button
            type="button"
            onClick={() => queueExport('pdf')}
            className="w-full px-3 py-2 text-left text-xs font-bold hover:bg-muted transition-colors flex items-center gap-2"
          >
            <FileDown size={14} /> {t('exportButton.exportPdf')}
          </button>
          <button
            type="button"
            onClick={() => queueExport('csv')}
            className="w-full px-3 py-2 text-left text-xs font-bold hover:bg-muted transition-colors flex items-center gap-2 border-t border-border"
          >
            <FileSpreadsheet size={14} /> {t('exportButton.exportCsv')}
          </button>
        </div>
      )}
    </div>
  );
};
