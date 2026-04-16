import React, { useState, useMemo, memo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ChevronDown,
  ChevronUp,
  Eye,
  Edit2,
  Trash2,
  ChevronLeft,
  ChevronRight,
  Settings2,
  Download,
  Search,
  Filter,
} from 'lucide-react';
import { DEFAULT_PAGE_SIZE, PAGE_SIZE_OPTIONS } from '../../lib/constants';

export interface Column<T> {
  header: string;
  accessorKey: keyof T | string;
  cell?: (item: T) => React.ReactNode;
  sortable?: boolean;
}

export interface ServerPaginationProps {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
}

interface DataTableProps<T> {
  data: T[];
  columns: Column<T>[];
  onRowClick?: (item: T) => void;
  onEditRow?: (item: T) => void;
  onDeleteRow?: (item: T) => void;
  isLoading?: boolean;
  serverPagination?: ServerPaginationProps;
}

function IFMSDataTableComponent<T extends { id?: string | number }>({
  data,
  columns,
  onRowClick,
  onEditRow,
  onDeleteRow,
  isLoading,
  serverPagination,
}: DataTableProps<T>) {
  const { t } = useTranslation();
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' } | null>(
    null,
  );
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [selectedRows, setSelectedRows] = useState<Set<string | number>>(new Set());
  const [visibleColumns, setVisibleColumns] = useState<Set<string>>(
    new Set(columns.map((c) => c.accessorKey as string)),
  );
  const [showColumnToggle, setShowColumnToggle] = useState(false);

  const getRowId = (item: T, index: number): string | number => item.id ?? `row-${index}`;
  const showViewAction = Boolean(onRowClick);
  const showEditAction = Boolean(onEditRow);
  const showDeleteAction = Boolean(onDeleteRow);
  const hasActions = showViewAction || showEditAction || showDeleteAction;

  const processedData = useMemo(() => {
    if (serverPagination) return data;
    let result = [...data];
    if (sortConfig !== null) {
      result.sort((a, b) => {
        const aVal = a[sortConfig.key as keyof T];
        const bVal = b[sortConfig.key as keyof T];
        if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
        if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
      });
    }
    return result;
  }, [data, sortConfig, serverPagination]);

  const activePage = serverPagination?.page ?? currentPage;
  const activePageSize = serverPagination?.pageSize ?? pageSize;
  const totalItems = serverPagination?.total ?? processedData.length;
  const totalPages = Math.ceil(totalItems / activePageSize);
  const paginatedData = serverPagination
    ? processedData
    : processedData.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const requestSort = (key: string) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  const toggleAll = () => {
    if (selectedRows.size === paginatedData.length) setSelectedRows(new Set());
    else {
      const pageStart = (currentPage - 1) * pageSize;
      setSelectedRows(new Set(paginatedData.map((d, idx) => getRowId(d, pageStart + idx))));
    }
  };

  const exportToCSV = () => {
    const headers = columns
      .filter((c) => visibleColumns.has(c.accessorKey as string))
      .map((c) => c.header)
      .join(',');
    const rows = processedData
      .map((item) =>
        columns
          .filter((c) => visibleColumns.has(c.accessorKey as string))
          .map((c) => {
            const val = item[c.accessorKey as keyof T];
            return typeof val === 'string' && val.includes(',') ? `"${val}"` : val;
          })
          .join(','),
      )
      .join('\n');

    const blob = new Blob([`${headers}\n${rows}`], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.setAttribute('hidden', '');
    a.setAttribute('href', url);
    a.setAttribute('download', `ifms_audit_${new Date().getTime()}.csv`);
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <div className="flex flex-col h-full bg-card rounded-2xl border border-border shadow-sm overflow-hidden">
      <div className="px-6 py-4 border-b border-border bg-muted/10 flex items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 px-3 py-1.5 bg-background border border-border rounded-lg shadow-sm">
            <Filter size={14} className="text-muted-foreground" />
            <span className="text-[10px] font-black uppercase text-foreground">
              {t('dataTable.itemsFlagged', { count: selectedRows.size })}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="relative">
            <button
              onClick={() => setShowColumnToggle(!showColumnToggle)}
              className="w-9 h-9 flex items-center justify-center hover:bg-muted rounded-xl text-muted-foreground transition-all border border-transparent hover:border-border"
              aria-label={t('dataTable.customizeColumns')}
            >
              <Settings2 size={16} />
            </button>
            {showColumnToggle && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowColumnToggle(false)} />
                <div className="absolute right-0 top-full mt-2 w-56 bg-card border border-border rounded-2xl shadow-2xl z-50 p-3 animate-in fade-in zoom-in-95 duration-150">
                  <p className="text-[10px] font-black text-muted-foreground uppercase mb-3 px-2 tracking-widest">
                    {t('dataTable.layoutConfig')}
                  </p>
                  <div className="space-y-1">
                    {columns.map((col) => (
                      <label
                        key={col.accessorKey as string}
                        className="flex items-center gap-3 px-2 py-2 hover:bg-muted rounded-lg cursor-pointer transition-colors group"
                      >
                        <input
                          type="checkbox"
                          checked={visibleColumns.has(col.accessorKey as string)}
                          onChange={() => {
                            const newVisible = new Set(visibleColumns);
                            if (newVisible.has(col.accessorKey as string))
                              newVisible.delete(col.accessorKey as string);
                            else newVisible.add(col.accessorKey as string);
                            setVisibleColumns(newVisible);
                          }}
                          className="w-4 h-4 rounded border-input text-primary focus:ring-primary"
                        />
                        <span className="text-xs font-bold text-muted-foreground group-hover:text-foreground">
                          {col.header}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
          <button
            onClick={exportToCSV}
            aria-label={t('exportButton.exportCsv')}
            className="flex items-center gap-2 h-9 px-4 bg-primary text-primary-foreground rounded-xl text-[10px] font-black uppercase tracking-widest shadow-lg shadow-primary/20 hover:opacity-90 transition-all"
          >
            <Download size={14} />
            {t('dataTable.dataDumpCsv')}
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto scroll-smooth">
        <table className="w-full text-left border-collapse min-w-[900px]">
          <thead className="sticky top-0 z-20 bg-muted/80 backdrop-blur-md border-b border-border">
            <tr>
              <th className="px-6 py-5 w-10">
                <input
                  type="checkbox"
                  checked={selectedRows.size === paginatedData.length && paginatedData.length > 0}
                  onChange={toggleAll}
                  className="w-4 h-4 rounded border-input text-primary focus:ring-primary transition-all"
                />
              </th>
              {columns
                .filter((c) => visibleColumns.has(c.accessorKey as string))
                .map((col) => (
                  <th
                    key={col.accessorKey as string}
                    className="px-6 py-5 text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em] cursor-pointer group select-none"
                    onClick={() => col.sortable !== false && requestSort(col.accessorKey as string)}
                  >
                    <div className="flex items-center gap-2">
                      {col.header}
                      {col.sortable !== false && (
                        <div className="flex flex-col opacity-0 group-hover:opacity-100 transition-opacity">
                          <ChevronUp
                            size={10}
                            className={
                              sortConfig?.key === col.accessorKey && sortConfig.direction === 'asc'
                                ? 'text-primary'
                                : 'text-muted-foreground/30'
                            }
                          />
                          <ChevronDown
                            size={10}
                            className={
                              sortConfig?.key === col.accessorKey && sortConfig.direction === 'desc'
                                ? 'text-primary'
                                : 'text-muted-foreground/30'
                            }
                          />
                        </div>
                      )}
                    </div>
                  </th>
                ))}
              {hasActions && (
                <th className="px-6 py-5 text-right text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em]">
                  {t('common.actions')}
                </th>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60">
            {isLoading ? (
              Array.from({ length: pageSize }).map((_, i) => (
                <tr key={i} className="animate-pulse">
                  <td colSpan={columns.length + (hasActions ? 2 : 1)} className="px-6 py-6">
                    <div className="h-5 bg-muted rounded-full w-full"></div>
                  </td>
                </tr>
              ))
            ) : paginatedData.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length + (hasActions ? 2 : 1)}
                  className="px-6 py-32 text-center text-muted-foreground italic"
                >
                  <div className="flex flex-col items-center gap-4 opacity-30">
                    <Search size={48} />
                    <p className="text-sm font-bold uppercase tracking-widest">
                      {t('dataTable.noRecords')}
                    </p>
                  </div>
                </td>
              </tr>
            ) : (
              paginatedData.map((item, rowIndex) => {
                const rowId = getRowId(item, (currentPage - 1) * pageSize + rowIndex);
                return (
                  <tr
                    key={rowId}
                    className={`hover:bg-primary/[0.02] transition-colors group ${showViewAction ? 'cursor-pointer' : ''}`}
                    onClick={() => onRowClick?.(item)}
                  >
                    <td className="px-6 py-5" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={selectedRows.has(rowId)}
                        onChange={(e) => {
                          const newSelected = new Set(selectedRows);
                          if (newSelected.has(rowId)) newSelected.delete(rowId);
                          else newSelected.add(rowId);
                          setSelectedRows(newSelected);
                        }}
                        className="w-4 h-4 rounded border-input text-primary focus:ring-primary transition-all"
                      />
                    </td>
                    {columns
                      .filter((c) => visibleColumns.has(c.accessorKey as string))
                      .map((col) => (
                        <td
                          key={col.accessorKey as string}
                          className="px-6 py-5 text-sm font-bold text-foreground"
                        >
                          {col.cell ? col.cell(item) : (item[col.accessorKey as keyof T] as any)}
                        </td>
                      ))}
                    {hasActions && (
                      <td className="px-6 py-5 text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="inline-flex items-center gap-1 opacity-20 group-hover:opacity-100 transition-opacity">
                          {showViewAction && (
                            <button
                              type="button"
                              onClick={() => onRowClick?.(item)}
                              className="w-8 h-8 flex items-center justify-center hover:bg-muted rounded-lg text-muted-foreground"
                              aria-label={t('common.viewDetails')}
                            >
                              <Eye size={14} />
                            </button>
                          )}
                          {showEditAction && (
                            <button
                              type="button"
                              onClick={() => onEditRow?.(item)}
                              className="w-8 h-8 flex items-center justify-center hover:bg-muted rounded-lg transition-all text-primary"
                              aria-label={t('common.editRecord')}
                            >
                              <Edit2 size={14} />
                            </button>
                          )}
                          {showDeleteAction && (
                            <button
                              type="button"
                              onClick={() => {
                                if (window.confirm(t('common.deleteConfirm'))) {
                                  onDeleteRow?.(item);
                                }
                              }}
                              className="w-8 h-8 flex items-center justify-center hover:bg-rose-500/10 rounded-lg transition-all text-rose-600"
                              aria-label={t('common.deleteRecord')}
                            >
                              <Trash2 size={14} />
                            </button>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <div className="px-6 py-4 border-t border-border bg-muted/5 flex items-center justify-between gap-4">
        <div className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">
          {t('common.indices')}{' '}
          <span className="text-foreground">
            {(activePage - 1) * activePageSize + 1} -{' '}
            {Math.min(activePage * activePageSize, totalItems)}
          </span>{' '}
          {t('common.of')} <span className="text-foreground">{totalItems}</span>{' '}
          {t('common.entries')}
        </div>
        <div className="flex items-center gap-8">
          <div className="flex items-center gap-3">
            <span className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">
              {t('common.pageSize')}
            </span>
            <select
              value={activePageSize}
              onChange={(e) => {
                const newSize = Number(e.target.value);
                if (serverPagination) {
                  serverPagination.onPageSizeChange(newSize);
                } else {
                  setPageSize(newSize);
                  setCurrentPage(1);
                }
              }}
              className="h-8 bg-background border border-border rounded-lg text-[10px] font-black outline-none px-2 shadow-sm"
            >
              {PAGE_SIZE_OPTIONS.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <button
              disabled={activePage === 1}
              onClick={() => {
                if (serverPagination) {
                  serverPagination.onPageChange(activePage - 1);
                } else {
                  setCurrentPage((prev) => Math.max(1, prev - 1));
                }
              }}
              className="w-8 h-8 flex items-center justify-center border border-border rounded-lg hover:bg-muted disabled:opacity-20 transition-all shadow-sm"
            >
              <ChevronLeft size={14} />
            </button>
            <div className="text-[10px] font-black px-4 uppercase tracking-widest">
              {activePage} / {totalPages || 1}
            </div>
            <button
              disabled={activePage === totalPages || totalPages === 0}
              onClick={() => {
                if (serverPagination) {
                  serverPagination.onPageChange(activePage + 1);
                } else {
                  setCurrentPage((prev) => Math.min(totalPages, prev + 1));
                }
              }}
              className="w-8 h-8 flex items-center justify-center border border-border rounded-lg hover:bg-muted disabled:opacity-20 transition-all shadow-sm"
            >
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export const IFMSDataTable = memo(IFMSDataTableComponent) as typeof IFMSDataTableComponent;
