
import React, { useState, useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiReports } from '../../lib/api/reports';
import PageHeader from '../ifms/PageHeader';
import ReportFilters from '../reports/ReportFilters';
import { IFMSDataTable } from '../ifms/DataTable';
import DetailsDrawer from '../ifms/DetailsDrawer';
import { 
  LineChart, Line, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, Cell
} from 'recharts';
import { 
  Pin, 
  PinOff, 
  BarChart3, 
  ArrowRightLeft, 
  Trophy, 
  TrendingUp, 
  TrendingDown, 
  ChevronRight,
  Maximize2,
  X
} from 'lucide-react';
import { TableSkeleton } from '../ifms/Skeletons';
import { useReportsStore } from '../../store';

const StationComparisonReport: React.FC = () => {
  const [pinnedIds, setPinnedIds] = useState<string[]>(() => {
    const saved = localStorage.getItem('ifms-pinned-stations');
    return saved ? JSON.parse(saved) : [];
  });
  const [comparisonIds, setComparisonIds] = useState<string[]>([]);
  const [showComparisonModal, setShowComparisonModal] = useState(false);
  const { stationId, productId, dateRange } = useReportsStore();
  const filters = {
    dateFrom: dateRange.from,
    dateTo: dateRange.to,
    stationId: stationId ?? undefined,
    productId: productId ?? undefined,
  };

  const comparisonQuery = useQuery({ 
    queryKey: ['station-comparison', filters], 
    queryFn: () => apiReports.stationComparison(filters) as Promise<any[]> 
  });

  useEffect(() => {
    localStorage.setItem('ifms-pinned-stations', JSON.stringify(pinnedIds));
  }, [pinnedIds]);

  const togglePin = (id: string) => {
    setPinnedIds(prev => prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id]);
  };

  const toggleCompare = (id: string) => {
    setComparisonIds(prev => {
      if (prev.includes(id)) return prev.filter(p => p !== id);
      if (prev.length >= 4) return prev;
      return [...prev, id];
    });
  };

  const comparisonData = useMemo(() => {
    if (!comparisonQuery.data) return [];
    // Sort so pinned are at the top
    return [...comparisonQuery.data].sort((a, b) => {
      const aPinned = pinnedIds.includes(a.id);
      const bPinned = pinnedIds.includes(b.id);
      if (aPinned && !bPinned) return -1;
      if (!aPinned && bPinned) return 1;
      return 0;
    });
  }, [comparisonQuery.data, pinnedIds]);

  const selectedStationsData = useMemo(() => {
    return comparisonQuery.data?.filter(s => comparisonIds.includes(s.id)) || [];
  }, [comparisonQuery.data, comparisonIds]);

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-12">
      <PageHeader 
        title="Branch Comparative Intelligence" 
        description="Benchmark performance across stations with multi-metric normalization and ranking."
        actions={
          <button 
            onClick={() => comparisonIds.length > 1 && setShowComparisonModal(true)}
            disabled={comparisonIds.length < 2}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold shadow-lg transition-all ${
              comparisonIds.length < 2 
                ? 'bg-muted text-muted-foreground cursor-not-allowed' 
                : 'bg-indigo-600 text-white shadow-indigo-500/20 hover:bg-indigo-700'
            }`}
          >
            <ArrowRightLeft size={16} />
            Compare {comparisonIds.length} Stations
          </button>
        }
      />

      <ReportFilters />

      <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-sm">
        <div className="p-6 border-b border-border bg-muted/10 flex items-center justify-between">
          <div className="flex items-center gap-2">
             <BarChart3 size={18} className="text-primary" />
             <h3 className="text-sm font-bold uppercase tracking-wider">Station Comparison Matrix</h3>
          </div>
          <p className="text-[10px] font-bold text-muted-foreground uppercase">Showing {comparisonData.length} active nodes</p>
        </div>

        {comparisonQuery.isLoading ? <TableSkeleton /> : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-muted/50 text-[10px] font-bold text-muted-foreground uppercase tracking-widest border-b border-border">
                <tr>
                  <th className="px-6 py-4 w-12">Pin</th>
                  <th className="px-6 py-4 min-w-[200px]">Station</th>
                  <th className="px-6 py-4">Sales ($)</th>
                  <th className="px-6 py-4">Margin %</th>
                  <th className="px-6 py-4">Shrink %</th>
                  <th className="px-6 py-4">OpEx Ratio</th>
                  <th className="px-6 py-4">Rank</th>
                  <th className="px-6 py-4 min-w-[120px]">7D Trend</th>
                  <th className="px-6 py-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {comparisonData.map((s) => (
                  <tr 
                    key={s.id} 
                    className={`text-xs hover:bg-muted/30 transition-colors ${comparisonIds.includes(s.id) ? 'bg-indigo-50/30 dark:bg-indigo-900/10' : ''}`}
                  >
                    <td className="px-6 py-4">
                       <button 
                        onClick={() => togglePin(s.id)}
                        className={`transition-colors ${pinnedIds.includes(s.id) ? 'text-primary' : 'text-muted-foreground opacity-20 hover:opacity-100'}`}
                       >
                         {pinnedIds.includes(s.id) ? <Pin size={16} fill="currentColor" /> : <PinOff size={16} />}
                       </button>
                    </td>
                    <td className="px-6 py-4">
                       <p className="font-bold text-foreground">{s.name}</p>
                       <p className="text-[10px] text-muted-foreground truncate">{s.location}</p>
                    </td>
                    <td className="px-6 py-4 font-medium">${s.sales.toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <span className="font-bold">{s.marginPct.toFixed(1)}%</span>
                        {s.marginPct > 15 ? <TrendingUp size={12} className="text-emerald-500" /> : <TrendingDown size={12} className="text-rose-500" />}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                       <span className={`font-bold ${s.shrinkagePct > 1 ? 'text-rose-600' : 'text-emerald-600'}`}>
                         {s.shrinkagePct.toFixed(2)}%
                       </span>
                    </td>
                    <td className="px-6 py-4 text-muted-foreground">{s.expenseRatio.toFixed(1)}%</td>
                    <td className="px-6 py-4">
                       <div className="flex items-center gap-1.5">
                         <span className={`flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-black ${s.rank === 1 ? 'bg-amber-400 text-amber-900' : 'bg-muted text-muted-foreground'}`}>
                           {s.rank}
                         </span>
                         <span className="text-[10px] font-bold opacity-50">{s.percentile}th</span>
                       </div>
                    </td>
                    <td className="px-6 py-4">
                       <div className="h-8 w-24">
                          <ResponsiveContainer width="100%" height="100%">
                             <LineChart data={s.trend}>
                                <Line type="monotone" dataKey="value" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
                             </LineChart>
                          </ResponsiveContainer>
                       </div>
                    </td>
                    <td className="px-6 py-4 text-right">
                       <button 
                        onClick={() => toggleCompare(s.id)}
                        className={`px-3 py-1.5 rounded-md text-[10px] font-black uppercase tracking-tighter transition-all ${
                          comparisonIds.includes(s.id) 
                            ? 'bg-indigo-600 text-white' 
                            : 'bg-muted text-muted-foreground hover:bg-muted-foreground/10'
                        }`}
                       >
                         {comparisonIds.includes(s.id) ? 'Compare' : '+ Compare'}
                       </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Comparison Modal */}
      {showComparisonModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-8 animate-in fade-in duration-300">
           <div className="absolute inset-0 bg-background/80 backdrop-blur-md" onClick={() => setShowComparisonModal(false)} />
           <div className="relative w-full max-w-6xl bg-card border border-border rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-full">
              <div className="p-6 border-b border-border bg-muted/10 flex items-center justify-between">
                 <div>
                    <h2 className="text-xl font-black tracking-tight">Multi-Station Benchmarking</h2>
                    <p className="text-[10px] font-bold text-muted-foreground uppercase mt-0.5">Comparing {selectedStationsData.length} Selected Branches</p>
                 </div>
                 <button onClick={() => setShowComparisonModal(false)} className="p-2 hover:bg-muted rounded-full text-muted-foreground">
                    <X size={20} />
                 </button>
              </div>

              <div className="flex-1 overflow-y-auto p-8 space-y-12">
                 <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    {selectedStationsData.map(s => (
                       <div key={s.id} className="p-4 rounded-2xl border border-border bg-muted/5 space-y-3">
                          <p className="text-xs font-black uppercase text-primary">{s.name}</p>
                          <div className="grid grid-cols-2 gap-2">
                             <div>
                                <p className="text-[9px] font-bold text-muted-foreground uppercase">Sales</p>
                                <p className="text-sm font-black">${s.sales.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
                             </div>
                             <div>
                                <p className="text-[9px] font-bold text-muted-foreground uppercase">Margin</p>
                                <p className="text-sm font-black">{s.marginPct.toFixed(1)}%</p>
                             </div>
                          </div>
                       </div>
                    ))}
                 </div>

                 <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    <div className="bg-card border border-border p-6 rounded-2xl shadow-sm">
                       <h4 className="text-sm font-bold uppercase tracking-widest text-muted-foreground mb-6">Revenue Performance (Normalized)</h4>
                       <div className="h-64">
                          <ResponsiveContainer width="100%" height="100%">
                             <BarChart data={selectedStationsData}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: 'hsl(var(--muted-foreground))', fontSize: 10}} />
                                <YAxis axisLine={false} tickLine={false} tick={{fill: 'hsl(var(--muted-foreground))', fontSize: 10}} />
                                <Tooltip contentStyle={{ borderRadius: '12px', border: '1px solid hsl(var(--border))' }} />
                                <Bar dataKey="sales" radius={[4, 4, 0, 0]} barSize={40}>
                                   {selectedStationsData.map((_, index) => (
                                     <Cell key={`cell-${index}`} fill={['#6366f1', '#10b981', '#f59e0b', '#ef4444'][index % 4]} />
                                   ))}
                                </Bar>
                             </BarChart>
                          </ResponsiveContainer>
                       </div>
                    </div>

                    <div className="bg-card border border-border p-6 rounded-2xl shadow-sm">
                       <h4 className="text-sm font-bold uppercase tracking-widest text-muted-foreground mb-6">Efficiency Matrix</h4>
                       <div className="h-64">
                          <ResponsiveContainer width="100%" height="100%">
                             <LineChart>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                                <XAxis dataKey="name" hide />
                                <YAxis axisLine={false} tickLine={false} tick={{fill: 'hsl(var(--muted-foreground))', fontSize: 10}} />
                                <Tooltip />
                                <Legend />
                                {selectedStationsData.map((s, idx) => (
                                  <Line 
                                    key={s.id} 
                                    data={s.trend} 
                                    type="monotone" 
                                    dataKey="value" 
                                    name={s.name} 
                                    stroke={['#6366f1', '#10b981', '#f59e0b', '#ef4444'][idx % 4]} 
                                    strokeWidth={2} 
                                    dot={false} 
                                  />
                                ))}
                             </LineChart>
                          </ResponsiveContainer>
                       </div>
                    </div>
                 </div>

                 <div className="bg-muted/10 p-6 rounded-2xl border border-dashed border-border text-center">
                    <p className="text-xs text-muted-foreground italic max-w-2xl mx-auto">
                      Benchmarking reveal significant variance in OpEx efficiency between <strong>{selectedStationsData[0]?.name}</strong> and <strong>{selectedStationsData[1]?.name}</strong>. Suggesting process audit for the lower-performing node to align with corporate efficiency targets.
                    </p>
                 </div>
              </div>

              <div className="p-6 border-t border-border flex justify-end">
                 <button 
                  onClick={() => setShowComparisonModal(false)}
                  className="px-6 py-2 bg-primary text-white font-bold rounded-xl text-sm"
                 >
                   Dismiss Analysis
                 </button>
              </div>
           </div>
        </div>
      )}
    </div>
  );
};

export default StationComparisonReport;
