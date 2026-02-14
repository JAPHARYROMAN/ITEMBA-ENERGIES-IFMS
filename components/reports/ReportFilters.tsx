import React, { useState } from 'react';
import { Calendar, Filter, Building2, Package, RefreshCcw } from 'lucide-react';
import { useReportsStore } from '../../store';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { setupDataSource } from '../../lib/data-source';
import { useAppStore } from '../../store';

const ReportFilters: React.FC = () => {
  const { stationId, productId, dateRange, setFilters } = useReportsStore();
  const queryClient = useQueryClient();
  const { addToast } = useAppStore();
  const [showMoreFilters, setShowMoreFilters] = useState(false);
  const { data: stations } = useQuery({ queryKey: ['stations'], queryFn: setupDataSource.stations.list });
  const { data: products } = useQuery({ queryKey: ['products'], queryFn: setupDataSource.products.list });

  const handleReload = () => {
    queryClient.invalidateQueries({ predicate: (q) => (String(q.queryKey[0] || '').startsWith('report')) });
    addToast('Report data refreshed', 'success');
  };

  return (
    <div className="bg-card border border-border p-2 rounded-xl flex flex-wrap items-center gap-2 shadow-sm mb-6">
      <div className="flex items-center gap-2 px-3 py-1.5 bg-muted/50 rounded-lg border border-border">
        <Calendar size={14} className="text-muted-foreground" />
        <input
          type="date"
          value={dateRange.from}
          onChange={(e) => setFilters({ dateRange: { ...dateRange, from: e.target.value } })}
          className="bg-transparent text-xs font-bold text-foreground outline-none"
        />
        <span className="text-xs font-bold text-muted-foreground">to</span>
        <input
          type="date"
          value={dateRange.to}
          onChange={(e) => setFilters({ dateRange: { ...dateRange, to: e.target.value } })}
          className="bg-transparent text-xs font-bold text-foreground outline-none"
        />
      </div>

      <div className="h-6 w-px bg-border mx-1 hidden sm:block"></div>

      <div className="flex items-center gap-4 flex-1">
        <div className="flex items-center gap-2">
          <Building2 size={14} className="text-muted-foreground" />
          <select 
            value={stationId || ''} 
            onChange={(e) => setFilters({ stationId: e.target.value || null })}
            className="bg-transparent border-none text-xs font-bold outline-none focus:ring-0 cursor-pointer"
          >
            <option value="">All Stations</option>
            {stations?.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>

        <div className="flex items-center gap-2">
          <Package size={14} className="text-muted-foreground" />
          <select 
            value={productId || ''} 
            onChange={(e) => setFilters({ productId: e.target.value || null })}
            className="bg-transparent border-none text-xs font-bold outline-none focus:ring-0 cursor-pointer"
          >
            <option value="">All Products</option>
            {products?.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
      </div>

      <div className="flex items-center gap-1">
        <button type="button" onClick={handleReload} className="p-2 hover:bg-muted rounded-lg text-muted-foreground transition-colors" title="Reload Data">
          <RefreshCcw size={16} />
        </button>
        <button type="button" onClick={() => { setShowMoreFilters((v) => !v); addToast(showMoreFilters ? 'Filters simplified' : 'Showing date & advanced options', 'info'); }} className="p-2 hover:bg-muted rounded-lg text-muted-foreground transition-colors" title="More Filters">
          <Filter size={16} />
        </button>
      </div>
      {showMoreFilters && (
        <div className="w-full pt-2 mt-2 border-t border-border flex flex-wrap gap-4 items-center text-xs text-muted-foreground">
          <span className="font-bold">Filters are applied to all report API endpoints.</span>
        </div>
      )}
    </div>
  );
};

export default ReportFilters;
