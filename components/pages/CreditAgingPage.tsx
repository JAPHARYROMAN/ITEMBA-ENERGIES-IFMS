import React from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { creditAgingRepo } from '../../lib/repositories';
import { formatCurrency } from '../../lib/currency';
import PageHeader from '../ifms/PageHeader';
import { TableSkeleton } from '../ifms/Skeletons';

export default function CreditAgingPage() {
  const { t } = useTranslation();
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['credit-aging'],
    queryFn: creditAgingRepo.getReport,
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('credit.aging', 'Credit Aging')}
        description={t('credit.agingDesc', 'Customer credit aging analysis')}
      />

      {isLoading && <TableSkeleton rows={4} />}
      {isError && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
          {(error as Error)?.message ?? 'Failed to load aging report'}
        </div>
      )}

      {data && (
        <>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div className="rounded-xl border border-border bg-card p-4">
              <p className="text-xs font-black uppercase tracking-wider text-muted-foreground">Total Outstanding</p>
              <p className="mt-1 text-2xl font-bold">{formatCurrency(data.total)}</p>
            </div>
            <div className="rounded-xl border border-border bg-card p-4">
              <p className="text-xs font-black uppercase tracking-wider text-muted-foreground">As Of</p>
              <p className="mt-1 text-2xl font-bold">{data.asOf}</p>
            </div>
            <div className="rounded-xl border border-border bg-card p-4">
              <p className="text-xs font-black uppercase tracking-wider text-muted-foreground">Buckets</p>
              <p className="mt-1 text-2xl font-bold">{data.buckets.length}</p>
            </div>
            <div className="rounded-xl border border-border bg-card p-4">
              <p className="text-xs font-black uppercase tracking-wider text-muted-foreground">Total Accounts</p>
              <p className="mt-1 text-2xl font-bold">{data.buckets.reduce((s, b) => s + b.count, 0)}</p>
            </div>
          </div>

          {/* Aging bar visualization */}
          <div className="rounded-xl border border-border bg-card p-6">
            <h3 className="mb-4 text-sm font-black uppercase tracking-wider text-muted-foreground">Aging Breakdown</h3>
            <div className="space-y-3">
              {data.buckets.map((bucket) => {
                const pct = data.total > 0 ? (bucket.amount / data.total) * 100 : 0;
                return (
                  <div key={bucket.bucket} className="space-y-1">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium">{bucket.bucket}</span>
                      <span className="text-muted-foreground">
                        {formatCurrency(bucket.amount)} ({bucket.count} accounts)
                      </span>
                    </div>
                    <div className="h-3 w-full rounded-full bg-muted">
                      <div
                        className="h-3 rounded-full bg-primary transition-all"
                        style={{ width: `${Math.max(pct, 1)}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Table */}
          <div className="overflow-hidden rounded-xl border border-border">
            <table className="w-full text-sm">
              <thead className="border-b border-border bg-muted/50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-black uppercase tracking-wider text-muted-foreground">Bucket</th>
                  <th className="px-4 py-3 text-left text-xs font-black uppercase tracking-wider text-muted-foreground">Days Range</th>
                  <th className="px-4 py-3 text-right text-xs font-black uppercase tracking-wider text-muted-foreground">Amount</th>
                  <th className="px-4 py-3 text-right text-xs font-black uppercase tracking-wider text-muted-foreground">Count</th>
                  <th className="px-4 py-3 text-right text-xs font-black uppercase tracking-wider text-muted-foreground">% of Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {data.buckets.map((bucket) => (
                  <tr key={bucket.bucket} className="hover:bg-muted/30">
                    <td className="px-4 py-3 font-medium">{bucket.bucket}</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {bucket.fromDays}–{bucket.toDays ?? '∞'} days
                    </td>
                    <td className="px-4 py-3 text-right">{formatCurrency(bucket.amount)}</td>
                    <td className="px-4 py-3 text-right">{bucket.count}</td>
                    <td className="px-4 py-3 text-right">
                      {data.total > 0 ? ((bucket.amount / data.total) * 100).toFixed(1) : '0.0'}%
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t-2 border-border bg-muted/30">
                <tr>
                  <td className="px-4 py-3 font-bold" colSpan={2}>Total</td>
                  <td className="px-4 py-3 text-right font-bold">{formatCurrency(data.total)}</td>
                  <td className="px-4 py-3 text-right font-bold">{data.buckets.reduce((s, b) => s + b.count, 0)}</td>
                  <td className="px-4 py-3 text-right font-bold">100%</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
