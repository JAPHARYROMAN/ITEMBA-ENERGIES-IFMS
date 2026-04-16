import React from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { Download, ExternalLink, RefreshCw } from 'lucide-react';
import PageHeader from '../ifms/PageHeader';
import { apiExports } from '../../lib/api/exports';
import { useAppStore } from '../../store';

const ExportsPage: React.FC = () => {
  const { t } = useTranslation();
  const { addToast } = useAppStore();

  const verificationBadgeClass: Record<string, string> = {
    basic: 'bg-slate-100 text-slate-700',
    signed: 'bg-blue-100 text-blue-700',
    signed_timestamped: 'bg-indigo-100 text-indigo-700',
    ltv: 'bg-emerald-100 text-emerald-700',
  };

  const exportsQuery = useQuery({
    queryKey: ['exports-history'],
    queryFn: () => apiExports.list(200),
    refetchInterval: 5000,
  });

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-12">
      <PageHeader
        title={t('pages.exportsTitle')}
        description={t('pages.exportsDesc')}
        actions={
          <button
            type="button"
            onClick={() => exportsQuery.refetch()}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-black uppercase tracking-widest border border-border bg-card text-foreground hover:bg-muted transition-colors"
          >
            <RefreshCw size={14} /> Refresh
          </button>
        }
      />

      <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-sm">
        <table className="w-full text-left">
          <thead className="bg-muted/40 text-[10px] font-black uppercase tracking-widest text-muted-foreground border-b border-border">
            <tr>
              <th className="px-4 py-3">Created</th>
              <th className="px-4 py-3">Type</th>
              <th className="px-4 py-3">Format</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Verification</th>
              <th className="px-4 py-3">Expires</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border text-xs">
            {(exportsQuery.data ?? []).map((item) => (
              <tr key={item.id} className="hover:bg-muted/20 transition-colors">
                <td className="px-4 py-3">{new Date(item.createdAt).toLocaleString()}</td>
                <td className="px-4 py-3 font-bold">{item.exportType}</td>
                <td className="px-4 py-3 uppercase">{item.format}</td>
                <td className="px-4 py-3">
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-black uppercase ${
                      item.status === 'ready'
                        ? 'bg-emerald-100 text-emerald-700'
                        : item.status === 'failed'
                          ? 'bg-rose-100 text-rose-700'
                          : 'bg-amber-100 text-amber-700'
                    }`}
                  >
                    {item.status}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-black uppercase ${
                      verificationBadgeClass[item.verificationLevel ?? 'basic'] ??
                      verificationBadgeClass.basic
                    }`}
                  >
                    {item.verificationLevel ?? 'basic'}
                  </span>
                </td>
                <td className="px-4 py-3">
                  {item.expiresAt ? new Date(item.expiresAt).toLocaleString() : '-'}
                </td>
                <td className="px-4 py-3">
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          await apiExports.download(item);
                        } catch (err: any) {
                          addToast(
                            err?.apiError?.message ?? err?.message ?? 'Download failed',
                            'error',
                          );
                        }
                      }}
                      disabled={item.status !== 'ready'}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded border border-border disabled:opacity-50"
                    >
                      <Download size={12} /> Download
                    </button>
                    <a
                      href={apiExports.verifyUrl(item.verificationToken)}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 px-2 py-1 rounded border border-border"
                    >
                      <ExternalLink size={12} /> Verify
                    </a>
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          await apiExports.downloadVerificationReceipt(item);
                        } catch (err: any) {
                          addToast(
                            err?.apiError?.message ??
                              err?.message ??
                              'Verification receipt download failed',
                            'error',
                          );
                        }
                      }}
                      disabled={item.format !== 'pdf'}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded border border-border disabled:opacity-50"
                    >
                      Receipt
                    </button>
                  </div>
                </td>
              </tr>
            ))}

            {!exportsQuery.isLoading && (exportsQuery.data ?? []).length === 0 && (
              <tr>
                <td className="px-4 py-10 text-center text-muted-foreground" colSpan={7}>
                  No exports yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default ExportsPage;
