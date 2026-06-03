import React, { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import PageHeader from '../ifms/PageHeader';
import FilterBar from '../ifms/FilterBar';
import { IFMSDataTable, Column } from '../ifms/DataTable';
import { matchesPermissionRequirement, useAuthStore, useAppStore } from '../../store';
import { TableSkeleton } from '../ifms/Skeletons';
import DetailsDrawer from '../ifms/DetailsDrawer';
import { Plus } from 'lucide-react';
import { ExportButton } from '../ifms/ExportButton';
import type { PermissionMatch } from '../../types';

interface GenericTablePageProps<T> {
  title: string;
  description: string;
  queryKey: string[];
  queryFn: () => Promise<T[]>;
  columns: Column<T>[];
  entityName?: string;
  FormComponent?: React.ComponentType<{ onSuccess: () => void; onCancel: () => void }>;
  onRowClick?: (item: T) => void;
  onDeleteRow?: (item: T) => void | Promise<void>;
  writePermissions?: string[];
  writePermissionMatch?: PermissionMatch;
  deletePermissions?: string[];
  deletePermissionMatch?: PermissionMatch;
}

export function GenericTablePage<T extends { id?: string | number }>({
  title,
  description,
  queryKey,
  queryFn,
  columns,
  entityName = 'Entry',
  FormComponent,
  onRowClick,
  onDeleteRow,
  writePermissions,
  writePermissionMatch = 'any',
  deletePermissions,
  deletePermissionMatch = 'any',
}: GenericTablePageProps<T>) {
  const { t } = useTranslation();
  const { user } = useAuthStore();
  const { addToast } = useAppStore();
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState('');
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const canWrite = matchesPermissionRequirement(user, writePermissions, writePermissionMatch);
  const canDelete = matchesPermissionRequirement(
    user,
    deletePermissions ?? writePermissions,
    deletePermissionMatch,
  );

  const handleDelete = useCallback(
    async (item: T) => {
      if (!onDeleteRow || !canDelete) return;
      try {
        await onDeleteRow(item);
        await queryClient.invalidateQueries({ queryKey });
        addToast(t('forms.saveSuccess', { entity: entityName }), 'success');
      } catch (err) {
        const msg =
          (err as { apiError?: { message?: string }; message?: string })?.apiError?.message ??
          (err as { message?: string })?.message ??
          `Failed to delete ${entityName.toLowerCase()}.`;
        addToast(msg, 'error');
      }
    },
    [onDeleteRow, canDelete, queryClient, queryKey, entityName, addToast, t],
  );

  const { data, isLoading, isError, error } = useQuery({
    queryKey,
    queryFn,
  });

  React.useEffect(() => {
    if (isError && error) {
      const err = error as Error & { apiError?: { message?: string } };
      const msg = err?.apiError?.message ?? err?.message ?? t('common.loading');
      addToast(msg, 'error');
    }
  }, [isError, error, addToast, t]);

  const filteredData = React.useMemo(() => {
    if (!data) return [];
    if (!searchQuery) return data;
    const lowerQuery = searchQuery.toLowerCase();
    return data.filter((item) =>
      Object.values(item).some((val) => String(val).toLowerCase().includes(lowerQuery)),
    );
  }, [data, searchQuery]);

  const handleCreateClick = () => {
    if (FormComponent && canWrite) {
      setIsDrawerOpen(true);
    } else {
      addToast(`Creation terminal for ${entityName} is under scheduled maintenance.`, 'info');
    }
  };

  const exportParams = React.useMemo(() => {
    const normalizedColumns = columns.map((c) => ({
      header: c.header,
      accessorKey: c.accessorKey as string,
    }));

    const rows = filteredData.map((item) => {
      const out: Record<string, unknown> = {};
      normalizedColumns.forEach((c) => {
        out[c.accessorKey] = item[c.accessorKey as keyof T] ?? '';
      });
      return out;
    });

    return {
      title,
      columns: normalizedColumns,
      rows,
    };
  }, [columns, filteredData, title]);

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-500">
      <PageHeader
        title={title}
        description={description}
        actions={
          <div className="flex items-center gap-2">
            <ExportButton
              exportType="tables.any"
              params={exportParams}
              label={t('common.export')}
            />
            {FormComponent && canWrite && (
              <button
                onClick={handleCreateClick}
                className="px-6 py-2.5 bg-primary text-primary-foreground rounded-xl text-xs font-black uppercase tracking-widest shadow-lg shadow-primary/20 hover:opacity-90 transition-all flex items-center gap-2"
              >
                <Plus size={14} /> {t('common.new', { name: entityName })}
              </button>
            )}
          </div>
        }
      />

      <FilterBar
        onSearch={setSearchQuery}
        onToggleFilters={() => addToast('Advanced filters are available in report pages.', 'info')}
      />

      <div className="min-h-[500px]">
        {isLoading ? (
          <div className="bg-card p-8 rounded-xl border border-border">
            <TableSkeleton />
          </div>
        ) : isError ? (
          <div className="bg-card p-8 rounded-xl border border-border text-center text-muted-foreground text-sm">
            Failed to load data. Check connection and try again.
          </div>
        ) : (
          <IFMSDataTable<T>
            data={filteredData}
            columns={columns}
            onRowClick={onRowClick}
            onEditRow={canWrite ? onRowClick : undefined}
            onDeleteRow={canDelete && onDeleteRow ? handleDelete : undefined}
          />
        )}
      </div>

      {FormComponent && (
        <DetailsDrawer
          isOpen={isDrawerOpen}
          onClose={() => setIsDrawerOpen(false)}
          title={t('pages.genericTitle', { entity: entityName })}
          subtitle={t('pages.genericDesc', { entity: entityName })}
          variant="large"
        >
          <div className="h-full bg-card">
            <FormComponent
              onSuccess={() => setIsDrawerOpen(false)}
              onCancel={() => setIsDrawerOpen(false)}
            />
          </div>
        </DetailsDrawer>
      )}
    </div>
  );
}
