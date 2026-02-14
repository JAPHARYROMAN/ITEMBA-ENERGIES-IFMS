
import React, { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { apiReports } from '../../lib/api/reports';
import { postReportAction } from '../../lib/api/actions';
import PageHeader from '../ifms/PageHeader';
import ReportFilters from '../reports/ReportFilters';
import StatCard from '../ifms/StatCard';
import { IFMSDataTable } from '../ifms/DataTable';
import DetailsDrawer from '../ifms/DetailsDrawer';
import { 
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  AreaChart, Area
} from 'recharts';
import { 
  Droplets, 
  AlertTriangle, 
  ArrowRight, 
  Info, 
  ShieldAlert, 
  Thermometer, 
  Activity,
  ArrowDownToLine,
  Search
} from 'lucide-react';
import { TableSkeleton } from '../ifms/Skeletons';
import { useAppStore } from '../../store';
import { useReportsStore } from '../../store';

const StockLossReport: React.FC = () => {
  const { addToast } = useAppStore();
  const { stationId, productId, dateRange } = useReportsStore();
  const [selectedLoss, setSelectedLoss] = useState<any>(null);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const reportActionMutation = useMutation({
    mutationFn: (payload: {
      action:
        | 'request-physical-audit'
        | 'classify-loss'
        | 'update-inventory-journals';
      targetId?: string;
      payload?: Record<string, unknown>;
    }) => postReportAction(payload.action, { targetId: payload.targetId, payload: payload.payload }),
  });
  const filters = {
    dateFrom: dateRange.from,
    dateTo: dateRange.to,
    stationId: stationId ?? undefined,
    productId: productId ?? undefined,
  };
  const stockLossQuery = useQuery({
    queryKey: ['report-stock-loss', filters],
    queryFn: () => apiReports.stockLoss(filters) as Promise<any>,
  });
  const lossRows = stockLossQuery.data?.tankLosses ?? [];
  const trendRows = stockLossQuery.data?.shrinkageTrend ?? [];
  const deliveryRows = stockLossQuery.data?.deliveryReconciliation ?? [];

  const alerts = [
    { type: 'Critical', message: 'Sudden level drop of 450L detected in Tank T-02 (Downtown) at 02:15 AM.', icon: ShieldAlert },
    { type: 'Warning', message: 'Tank T-01 showing repeated negative variance (>0.5%) over last 4 reconciliation cycles.', icon: AlertTriangle },
    { type: 'Info', message: 'Calibration required for Pump 04 Nozzle 02 based on consistent delivery variance.', icon: Info },
  ];

  return (
    <div className="space-y-8 animate-in fade-in duration-700 pb-12">
      <PageHeader 
        title="Stock Loss Intelligence" 
        description="Shrinkage monitoring, tank variance, and inventory reconciliation audit."
        actions={
          <button
            type="button"
            onClick={async () => {
              try {
                await reportActionMutation.mutateAsync({
                  action: 'request-physical-audit',
                  payload: { stationId: stationId ?? null, productId: productId ?? null },
                });
                addToast('Physical audit request submitted for scheduling', 'success');
              } catch (err: any) {
                addToast(err?.apiError?.message ?? err?.message ?? 'Failed to request physical audit', 'error');
              }
            }}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-bold shadow-lg shadow-primary/20 hover:opacity-90"
          >
            Request Physical Audit
          </button>
        }
      />

      <ReportFilters />

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* LEFT COLUMN: KPI + EQUATION + ALERTS */}
        <div className="lg:col-span-4 space-y-6">
          <div className="grid grid-cols-1 gap-4">
             <StatCard label="Net Loss (Liters)" value={`${stockLossQuery.data?.summary?.netLossLiters ?? 0} L`} delta={0} trend="neutral" />
             <StatCard label="Value Loss ($)" value={`$${stockLossQuery.data?.summary?.valueLoss ?? 0}`} delta={0} trend="neutral" />
             <StatCard label="Avg. Shrinkage %" value={`${stockLossQuery.data?.summary?.avgShrinkagePct ?? 0}%`} delta={0} trend="neutral" />
          </div>

          <div className="bg-card border border-border rounded-2xl p-6 shadow-sm overflow-hidden relative group">
            <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:scale-110 transition-transform">
              <Activity size={80} />
            </div>
            <h3 className="text-sm font-black uppercase tracking-widest text-primary mb-6 flex items-center gap-2">
              <ArrowDownToLine size={16} />
              Movement Equation
            </h3>
            <div className="space-y-4 relative z-10">
              <div className="flex items-center justify-between text-xs font-medium bg-muted/30 p-2 rounded">
                 <span className="text-muted-foreground">Opening Stock</span>
                 <span className="font-bold">24,500 L</span>
              </div>
              <div className="flex items-center justify-center">
                <div className="w-px h-2 bg-border"></div>
              </div>
              <div className="flex items-center justify-between text-xs font-medium bg-emerald-500/5 text-emerald-700 p-2 rounded border border-emerald-500/10">
                 <span className="flex items-center gap-1 font-bold">+ Receipts</span>
                 <span className="font-bold">15,000 L</span>
              </div>
              <div className="flex items-center justify-center">
                <div className="w-px h-2 bg-border"></div>
              </div>
              <div className="flex items-center justify-between text-xs font-medium bg-rose-500/5 text-rose-700 p-2 rounded border border-rose-500/10">
                 <span className="flex items-center gap-1 font-bold">- Sales</span>
                 <span className="font-bold">12,450 L</span>
              </div>
              <div className="flex items-center justify-center">
                <div className="w-px h-2 bg-border"></div>
              </div>
              <div className="flex items-center justify-between text-sm font-black border-t-2 border-primary/20 pt-4">
                 <span>Closing (Book)</span>
                 <span>27,050 L</span>
              </div>
            </div>
          </div>

          <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-sm">
             <div className="p-4 bg-muted/30 border-b border-border">
               <h3 className="text-xs font-bold uppercase tracking-wider flex items-center gap-2">
                 <AlertTriangle size={14} className="text-amber-500" />
                 Operational Alerts
               </h3>
             </div>
             <div className="divide-y divide-border">
                {alerts.map((alert, i) => (
                  <div key={i} className="p-4 flex gap-3 hover:bg-muted/10 transition-colors">
                    <alert.icon size={18} className={alert.type === 'Critical' ? 'text-rose-500' : alert.type === 'Warning' ? 'text-amber-500' : 'text-blue-500'} />
                    <p className="text-xs leading-relaxed text-muted-foreground">
                      <span className="font-bold text-foreground block mb-0.5">{alert.type}</span>
                      {alert.message}
                    </p>
                  </div>
                ))}
             </div>
          </div>
        </div>

        {/* RIGHT COLUMN: TRENDS + TABLES */}
        <div className="lg:col-span-8 space-y-8">
          <div className="bg-card border border-border rounded-2xl p-6 shadow-sm">
            <div className="flex items-center justify-between mb-8">
              <div>
                <h3 className="text-lg font-bold tracking-tight">Shrinkage Trend Intelligence</h3>
                <p className="text-xs text-muted-foreground uppercase tracking-wider font-bold mt-0.5">Global Station Performance %</p>
              </div>
              <div className="flex items-center gap-4 text-[10px] font-bold">
                <div className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full bg-primary"></div>
                  <span>LOSS %</span>
                </div>
                <div className="flex items-center gap-1.5 opacity-40">
                  <div className="w-2 h-2 rounded-full bg-border border border-muted-foreground"></div>
                  <span>TARGET (0.3%)</span>
                </div>
              </div>
            </div>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={trendRows}>
                  <defs>
                    <linearGradient id="colorLoss" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.1}/>
                      <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                  <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{fill: 'hsl(var(--muted-foreground))', fontSize: 10}} dy={10} />
                  <YAxis axisLine={false} tickLine={false} tick={{fill: 'hsl(var(--muted-foreground))', fontSize: 10}} />
                  <Tooltip contentStyle={{ borderRadius: '12px', border: '1px solid hsl(var(--border))', fontSize: '11px' }} />
                  <Area type="monotone" dataKey="rate" stroke="hsl(var(--primary))" strokeWidth={3} fillOpacity={1} fill="url(#colorLoss)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-sm">
             <div className="p-6 border-b border-border flex items-center justify-between">
                <h3 className="text-sm font-bold uppercase tracking-wider">Tank Variance Audit</h3>
                <button 
                  onClick={() => setSelectedLoss({ type: 'Classification' })}
                  className="text-[10px] font-bold text-primary hover:underline uppercase"
                >
                  Classify Losses
                </button>
             </div>
             {stockLossQuery.isLoading ? <TableSkeleton /> : (
               <IFMSDataTable 
                 // Fix: Mapping tankId to id to satisfy generic constraint
                 data={lossRows.map((item: any) => ({ ...item, id: item.tankId }))}
                 columns={[
                   { header: 'Tank', accessorKey: 'tankId' },
                   { header: 'Station', accessorKey: 'station' },
                   { header: 'Exp. (L)', accessorKey: 'expected', cell: (l: any) => l.expected.toLocaleString() },
                   { header: 'Act. (L)', accessorKey: 'actual', cell: (l: any) => l.actual.toLocaleString() },
                   { header: 'Var (L)', accessorKey: 'variance', cell: (l: any) => (
                      <span className={`font-bold ${l.variance < 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                        {l.variance > 0 ? '+' : ''}{l.variance}
                      </span>
                   )},
                   { header: 'Shrink %', accessorKey: 'variancePct', cell: (l: any) => (
                      <span className={`px-2 py-0.5 rounded text-[10px] font-black ${Math.abs(l.variancePct) > 0.5 ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-700'}`}>
                        {l.variancePct.toFixed(2)}%
                      </span>
                   )}
                 ]}
               />
             )}
          </div>

          <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-sm">
             <div className="p-6 border-b border-border">
                <h3 className="text-sm font-bold uppercase tracking-wider">Delivery Reconciliation Variance</h3>
             </div>
             {stockLossQuery.isLoading ? <TableSkeleton /> : (
                <table className="w-full text-left">
                  <thead className="bg-muted/50 text-[10px] font-bold text-muted-foreground uppercase tracking-widest border-b border-border">
                    <tr>
                      <th className="px-6 py-3">GRN ID</th>
                      <th className="px-6 py-3">Ordered</th>
                      <th className="px-6 py-3">B/L Volume</th>
                      <th className="px-6 py-3">Rec. Volume</th>
                      <th className="px-6 py-3 text-right">Variance</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {deliveryRows?.map((d: any, i: number) => (
                      <tr key={i} className="text-xs hover:bg-muted/30 transition-colors">
                        <td className="px-6 py-4">
                           <p className="font-bold">{d.id}</p>
                           <p className="text-[10px] text-muted-foreground">{d.date}</p>
                        </td>
                        <td className="px-6 py-4 text-muted-foreground">{d.ordered.toLocaleString()} L</td>
                        <td className="px-6 py-4 font-medium">{d.billOfLading.toLocaleString()} L</td>
                        <td className="px-6 py-4 font-black">{d.received.toLocaleString()} L</td>
                        <td className={`px-6 py-4 text-right font-bold ${d.variance < 0 ? 'text-rose-500' : 'text-emerald-500'}`}>
                           {d.variance > 0 ? '+' : ''}{d.variance} L
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
             )}
          </div>
        </div>
      </div>

      <DetailsDrawer 
        isOpen={!!selectedLoss} 
        onClose={() => setSelectedLoss(null)} 
        title="Loss Classification & Attribution"
        subtitle="Operational Intelligence System • Shrinkage Diagnosis"
      >
        <div className="space-y-8">
           <div className="bg-indigo-500/10 border border-indigo-200 p-4 rounded-xl flex gap-3">
              <Thermometer size={20} className="text-indigo-600 flex-shrink-0" />
              <div className="text-xs leading-relaxed text-indigo-900">
                <span className="font-bold block mb-1">Environmental Note:</span>
                Higher than average ambient temperatures (32°C+) were recorded during last 72 hours. Expect <span className="font-bold">~0.15% increase</span> in evaporation-linked shrinkage across fuel tanks.
              </div>
           </div>

           <div className="space-y-4">
              <h4 className="text-[10px] font-black uppercase tracking-widest text-primary border-b border-border pb-2">Classification Matrix</h4>
              <div className="grid grid-cols-1 gap-3">
                 {[
                   { label: 'Evaporation', icon: Droplets, color: 'text-blue-500', desc: 'Natural volume reduction due to temperature fluctuations.' },
                   { label: 'Leakage / Technical', icon: AlertTriangle, color: 'text-rose-500', desc: 'Physical loss from piping or tank integrity issues.' },
                   { label: 'Calibration Error', icon: Thermometer, color: 'text-amber-500', desc: 'Discrepancy between mechanical meter and probe sensor.' },
                   { label: 'Unauthorized Removal', icon: ShieldAlert, color: 'text-slate-900', desc: 'Suspected theft or pilferage during operations.' },
                   { label: 'Unknown / Transit', icon: Search, color: 'text-muted-foreground', desc: 'Variance originating from delivery or undocumented transfer.' },
                 ].map(cat => (
                   <button
                     key={cat.label}
                     type="button"
                     onClick={async () => {
                       try {
                         await reportActionMutation.mutateAsync({
                           action: 'classify-loss',
                           targetId: selectedLoss?.tankId,
                           payload: { category: cat.label },
                         });
                         setSelectedCategory(cat.label);
                         addToast(`Loss classified as ${cat.label}`, 'success');
                       } catch (err: any) {
                         addToast(err?.apiError?.message ?? err?.message ?? 'Failed to classify loss', 'error');
                       }
                     }}
                     className="flex items-start gap-4 p-4 border border-border rounded-xl hover:bg-muted/50 transition-all text-left group"
                   >
                      <div className={`p-2 rounded-lg bg-white shadow-sm group-hover:scale-110 transition-transform ${cat.color}`}>
                        <cat.icon size={18} />
                      </div>
                      <div>
                        <p className="text-sm font-bold text-foreground">{cat.label}</p>
                        <p className="text-[10px] text-muted-foreground leading-snug">{cat.desc}</p>
                      </div>
                      <ChevronRight size={14} className="ml-auto mt-1 opacity-20" />
                   </button>
                 ))}
              </div>
           </div>

           <div className="pt-6">
              <button
                type="button"
                onClick={async () => {
                  try {
                    await reportActionMutation.mutateAsync({
                      action: 'update-inventory-journals',
                      targetId: selectedLoss?.tankId,
                      payload: { classification: selectedCategory },
                    });
                    addToast('Inventory journals updated from current reconciliation', 'success');
                  } catch (err: any) {
                    addToast(err?.apiError?.message ?? err?.message ?? 'Failed to update inventory journals', 'error');
                  }
                }}
                className="w-full py-3 bg-primary text-white font-bold rounded-xl shadow-lg shadow-primary/20 text-sm"
              >
                Update Inventory Journals
              </button>
           </div>
        </div>
      </DetailsDrawer>
    </div>
  );
};

const ChevronRight = ({ size, className }: { size: number, className: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="m9 18 6-6-6-6"/></svg>
);

export default StockLossReport;
