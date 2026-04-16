import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { FileText, ChevronDown } from 'lucide-react';
import PageHeader from '../ifms/PageHeader';
import FilterBar from '../ifms/FilterBar';
import { IFMSDataTable } from '../ifms/DataTable';
import { TableSkeleton } from '../ifms/Skeletons';
import DetailsDrawer from '../ifms/DetailsDrawer';
import { ExportButton } from '../ifms/ExportButton';
import { fetchAuditLogs, type AuditLogEntry } from '../../lib/api/audit';

export default function AuditLogPage() {
  const { t } = useTranslation();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [entityFilter, setEntityFilter] = useState('');
  const [actionFilter, setActionFilter] = useState('');
  const [selectedEntry, setSelectedEntry] = useState<AuditLogEntry | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['audit-logs', page, entityFilter, actionFilter],
    queryFn: () =>
      fetchAuditLogs({
        page,
        pageSize: 25,
        entity: entityFilter || undefined,
        action: actionFilter || undefined,
      }),
  });

  const logs = data?.data ?? [];
  const filtered = search
    ? logs.filter(
        (l) =>
          l.entity.toLowerCase().includes(search.toLowerCase()) ||
          l.action.toLowerCase().includes(search.toLowerCase()) ||
          (l.actorUserId ?? '').toLowerCase().includes(search.toLowerCase()),
      )
    : logs;

  const actionColor = (action: string) => {
    switch (action) {
      case 'create':
        return 'bg-emerald-100 text-emerald-700 border-emerald-200';
      case 'update':
        return 'bg-blue-100 text-blue-700 border-blue-200';
      case 'delete':
        return 'bg-rose-100 text-rose-700 border-rose-200';
      default:
        return 'bg-slate-100 text-slate-700 border-slate-200';
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <PageHeader
        title={t('pages.auditTitle')}
        description={t('pages.auditDesc')}
        icon={FileText}
        actions={
          <ExportButton
            exportType="tables.any"
            params={{
              title: 'Audit Log Export',
              columns: [
                { header: 'Entity', accessorKey: 'entity' },
                { header: 'Entity ID', accessorKey: 'entityId' },
                { header: 'Action', accessorKey: 'action' },
                { header: 'Actor', accessorKey: 'actorUserId' },
                { header: 'IP', accessorKey: 'ip' },
                { header: 'Timestamp', accessorKey: 'createdAt' },
              ],
              rows: filtered.map((l) => ({
                ...l,
                createdAt: new Date(l.createdAt).toISOString(),
              })),
            }}
            label="Export"
          />
        }
      />

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex-1">
          <FilterBar onSearch={setSearch} showDate={false} />
        </div>
        <div className="flex gap-2">
          <select
            value={entityFilter}
            onChange={(e) => {
              setEntityFilter(e.target.value);
              setPage(1);
            }}
            className="px-3 py-2 border border-border rounded-xl text-xs font-bold bg-card focus:ring-2 focus:ring-primary/30"
          >
            <option value="">All Entities</option>
            {[
              'shifts',
              'sales_transactions',
              'deliveries',
              'tank_dips',
              'reconciliations',
              'expenses',
              'users',
              'approval_requests',
            ].map((e) => (
              <option key={e} value={e}>
                {e}
              </option>
            ))}
          </select>
          <select
            value={actionFilter}
            onChange={(e) => {
              setActionFilter(e.target.value);
              setPage(1);
            }}
            className="px-3 py-2 border border-border rounded-xl text-xs font-bold bg-card focus:ring-2 focus:ring-primary/30"
          >
            <option value="">All Actions</option>
            {['create', 'update', 'delete', 'approve', 'reject', 'cancel', 'login'].map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </div>
      </div>

      {isLoading ? (
        <div className="bg-card border border-border rounded-xl p-8">
          <TableSkeleton />
        </div>
      ) : (
        <IFMSDataTable
          data={filtered}
          onRowClick={(row: AuditLogEntry) => setSelectedEntry(row)}
          columns={[
            {
              header: 'Timestamp',
              accessorKey: 'createdAt',
              cell: (r: AuditLogEntry) => (
                <span className="text-xs font-mono">{new Date(r.createdAt).toLocaleString()}</span>
              ),
            },
            { header: 'Entity', accessorKey: 'entity' },
            {
              header: 'Action',
              accessorKey: 'action',
              cell: (r: AuditLogEntry) => (
                <span
                  className={`px-2 py-0.5 rounded text-[10px] font-black uppercase border ${actionColor(r.action)}`}
                >
                  {r.action}
                </span>
              ),
            },
            {
              header: 'Entity ID',
              accessorKey: 'entityId',
              cell: (r: AuditLogEntry) => (
                <span className="text-xs font-mono">{r.entityId.slice(0, 8)}...</span>
              ),
            },
            {
              header: 'Actor',
              accessorKey: 'actorUserId',
              cell: (r: AuditLogEntry) =>
                r.actorUserId ? (
                  <span className="text-xs font-mono">{r.actorUserId.slice(0, 8)}...</span>
                ) : (
                  <span className="text-muted-foreground text-xs">system</span>
                ),
            },
            {
              header: 'IP',
              accessorKey: 'ip',
              cell: (r: AuditLogEntry) => <span className="text-xs font-mono">{r.ip ?? '-'}</span>,
            },
          ]}
        />
      )}

      {(data?.total ?? 0) > 25 && (
        <div className="flex items-center justify-center gap-2 pt-2">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="px-3 py-1.5 text-xs font-bold border border-border rounded-lg disabled:opacity-40"
          >
            Previous
          </button>
          <span className="text-xs font-bold text-muted-foreground">
            Page {page} of {Math.ceil((data?.total ?? 0) / 25)}
          </span>
          <button
            onClick={() => setPage((p) => p + 1)}
            disabled={page * 25 >= (data?.total ?? 0)}
            className="px-3 py-1.5 text-xs font-bold border border-border rounded-lg disabled:opacity-40"
          >
            Next
          </button>
        </div>
      )}

      <DetailsDrawer
        isOpen={!!selectedEntry}
        onClose={() => setSelectedEntry(null)}
        title="Audit Detail"
        subtitle={selectedEntry ? `${selectedEntry.entity} • ${selectedEntry.action}` : ''}
      >
        {selectedEntry && (
          <div className="p-6 space-y-6">
            <div className="grid grid-cols-2 gap-4">
              {[
                ['Entity', selectedEntry.entity],
                ['Entity ID', selectedEntry.entityId],
                ['Action', selectedEntry.action],
                ['Actor', selectedEntry.actorUserId ?? 'system'],
                ['IP', selectedEntry.ip ?? '-'],
                ['Timestamp', new Date(selectedEntry.createdAt).toLocaleString()],
              ].map(([label, value]) => (
                <div key={label} className="p-3 bg-muted/20 rounded-xl border border-border">
                  <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                    {label}
                  </p>
                  <p className="text-sm font-bold mt-1 break-all">{value}</p>
                </div>
              ))}
            </div>

            {selectedEntry.beforeJson && (
              <div>
                <h4 className="text-xs font-black uppercase tracking-[0.2em] text-primary border-b border-border pb-2 mb-3">
                  Before
                </h4>
                <pre className="text-xs bg-muted/30 rounded-xl p-4 overflow-auto max-h-60 border border-border">
                  {JSON.stringify(selectedEntry.beforeJson, null, 2)}
                </pre>
              </div>
            )}

            {selectedEntry.afterJson && (
              <div>
                <h4 className="text-xs font-black uppercase tracking-[0.2em] text-primary border-b border-border pb-2 mb-3">
                  After
                </h4>
                <pre className="text-xs bg-muted/30 rounded-xl p-4 overflow-auto max-h-60 border border-border">
                  {JSON.stringify(selectedEntry.afterJson, null, 2)}
                </pre>
              </div>
            )}
          </div>
        )}
      </DetailsDrawer>
    </div>
  );
}
