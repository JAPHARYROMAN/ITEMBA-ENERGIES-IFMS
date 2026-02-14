
import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import PageHeader from '../ifms/PageHeader';
import FilterBar from '../ifms/FilterBar';
import { IFMSDataTable, Column } from '../ifms/DataTable';
import { useAuthStore, useAppStore } from '../../store';
import { TableSkeleton } from '../ifms/Skeletons';
import DetailsDrawer from '../ifms/DetailsDrawer';
import { Plus } from 'lucide-react';

interface GenericTablePageProps<T> {
  title: string;
  description: string;
  queryKey: string[];
  queryFn: () => Promise<T[]>;
  columns: Column<T>[];
  entityName?: string;
  FormComponent?: React.ComponentType<{ onSuccess: () => void; onCancel: () => void }>;
  onRowClick?: (item: T) => void;
  onDeleteRow?: (item: T) => void;
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
}: GenericTablePageProps<T>) {
  const { user } = useAuthStore();
  const { addToast } = useAppStore();
  const [searchQuery, setSearchQuery] = useState('');
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  
  const { data, isLoading, isError, error } = useQuery({
    queryKey,
    queryFn,
  });

  React.useEffect(() => {
    if (isError && error) {
      const msg = (error as any)?.apiError?.message ?? (error as Error)?.message ?? 'Failed to load data';
      addToast(msg, 'error');
    }
  }, [isError, error, addToast]);

  const filteredData = React.useMemo(() => {
    if (!data) return [];
    if (!searchQuery) return data;
    const lowerQuery = searchQuery.toLowerCase();
    return data.filter(item => 
      Object.values(item).some(val => 
        String(val).toLowerCase().includes(lowerQuery)
      )
    );
  }, [data, searchQuery]);

  const isAuditor = user?.role === 'auditor';

  const handleCreateClick = () => {
    if (FormComponent) {
      setIsDrawerOpen(true);
    } else {
      addToast(`Creation terminal for ${entityName} is under scheduled maintenance.`, 'info');
    }
  };

  const handleExport = () => {
    const headers = columns.map((c) => c.header);
    const rows = filteredData.map((item) =>
      columns.map((c) => {
        if (c.cell) {
          const rendered = c.cell(item);
          return typeof rendered === 'string' || typeof rendered === 'number'
            ? rendered
            : '';
        }
        const value = item[c.accessorKey as keyof T];
        return value ?? '';
      }),
    );
    const csv = [headers, ...rows]
      .map((row) =>
        row
          .map((cell) => {
            const v = String(cell ?? '');
            return v.includes(',') || v.includes('"') ? `"${v.replaceAll('"', '""')}"` : v;
          })
          .join(','),
      )
      .join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${entityName.toLowerCase().replace(/\s+/g, '-')}-export.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
    addToast(`${entityName} export downloaded`, 'success');
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-500">
      <PageHeader 
        title={title} 
        description={description}
        actions={
          !isAuditor && (
            <button 
              onClick={handleCreateClick}
              className="px-6 py-2.5 bg-primary text-primary-foreground rounded-xl text-xs font-black uppercase tracking-widest shadow-lg shadow-primary/20 hover:opacity-90 transition-all flex items-center gap-2"
            >
              <Plus size={14} /> New {entityName}
            </button>
          )
        }
      />

      <FilterBar
        onSearch={setSearchQuery}
        onExport={handleExport}
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
          <IFMSDataTable
            data={filteredData}
            columns={columns as any}
            onRowClick={onRowClick}
            onEditRow={onRowClick}
            onDeleteRow={onDeleteRow}
          />
        )}
      </div>

      {FormComponent && (
        <DetailsDrawer 
          isOpen={isDrawerOpen} 
          onClose={() => setIsDrawerOpen(false)} 
          title={`Data Entry Terminal`}
          subtitle={`Secure Input scoped to ${entityName}`}
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
