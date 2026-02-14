
import React, { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { apiReports } from '../../lib/api/reports';
import { postReportAction } from '../../lib/api/actions';
import PageHeader from '../ifms/PageHeader';
import ReportFilters from '../reports/ReportFilters';
import StatCard from '../ifms/StatCard';
import { IFMSDataTable } from '../ifms/DataTable';
import DetailsDrawer from '../ifms/DetailsDrawer';
import { useAppStore } from '../../store';
import { downloadCSV } from '../../lib/exportUtils';
import { useReportsStore } from '../../store';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  Cell, ComposedChart, Line
} from 'recharts';
import { 
  TrendingUp, 
  DollarSign, 
  Percent, 
  Target, 
  Info, 
  ChevronRight, 
  ArrowUpRight, 
  Scale, 
  FileText,
  PackageCheck
} from 'lucide-react';
import { DashboardSkeleton, TableSkeleton } from '../ifms/Skeletons';

const ProfitabilityReport: React.FC = () => {
  const { addToast } = useAppStore();
  const { stationId, productId, dateRange } = useReportsStore();
  const [drilldown, setDrilldown] = useState<any>(null);
  const reportActionMutation = useMutation({
    mutationFn: () => postReportAction('run-sensitivity-simulation', { payload: { stationId, productId } }),
  });
  const filters = {
    dateFrom: dateRange.from,
    dateTo: dateRange.to,
    stationId: stationId ?? undefined,
    productId: productId ?? undefined,
  };
  const profitabilityQuery = useQuery({
    queryKey: ['profitability-report', filters],
    queryFn: () => apiReports.profitability(filters) as Promise<any>,
  });

  if (profitabilityQuery.isLoading) return <DashboardSkeleton />;

  const kpis = profitabilityQuery.data?.metrics;
  const marginByProduct = profitabilityQuery.data?.marginByProduct ?? [];
  const stationProfit = profitabilityQuery.data?.stationContribution ?? [];
  const priceData = profitabilityQuery.data?.priceImpact;

  const insights = [
    { label: 'Margin Growth', text: 'Avg. Gross Margin per Liter improved 1.2% WoW due to supply optimization.', type: 'positive' },
    { label: 'Expense Risk', text: 'Utility expenses at Downtown Station are 15% above benchmark allocated budget.', type: 'warning' },
    { label: 'Product Mix', text: 'V-Power Racing contribution grew by 8% despite lower overall volume.', type: 'positive' },
    { label: 'Revenue Opportunity', text: 'Recent $0.10 price adjustment at Highway Station projects $5,000 monthly margin upside.', type: 'info' }
  ];

  return (
    <div className="space-y-8 animate-in fade-in duration-700 pb-12">
      <PageHeader 
        title="Executive Profitability Analysis" 
        description="Bottom-line tracking, cost-to-serve modeling, and margin optimization intelligence."
        actions={
          <button type="button" onClick={() => { const k = kpis; if (k) downloadCSV('profitability-exec-deck.csv', ['Metric', 'Value', 'Change'], [['Gross Profit', k.grossProfit?.value, k.grossProfit?.change], ['Net Contribution', k.netProfit?.value, k.netProfit?.change], ['Margin per Liter', k.marginPerLiter?.value, k.marginPerLiter?.change], ['OpEx Ratio', `${k.opexRatio?.value}%`, k.opexRatio?.change]]); addToast('Executive deck exported', 'success'); }} className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-bold shadow-lg shadow-primary/20 hover:opacity-90">
            Export Executive Deck
          </button>
        }
      />

      <ReportFilters />

      {/* Primary KPI Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard label="Gross Profit" value={`$${kpis?.grossProfit.value.toLocaleString(undefined, { maximumFractionDigits: 0 })}`} delta={kpis?.grossProfit.change} trend={kpis?.grossProfit.trend as any} />
        <StatCard label="Net Contribution" value={`$${kpis?.netProfit.value.toLocaleString(undefined, { maximumFractionDigits: 0 })}`} delta={kpis?.netProfit.change} trend={kpis?.netProfit.trend as any} />
        <StatCard label="Margin per Liter" value={`$${kpis?.marginPerLiter.value.toFixed(2)}`} delta={kpis?.marginPerLiter.change} trend={kpis?.marginPerLiter.trend as any} />
        <StatCard label="OpEx Ratio" value={`${kpis?.opexRatio.value.toFixed(1)}%`} delta={kpis?.opexRatio.change} trend={kpis?.opexRatio.trend as any} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Product Margin Chart */}
        <div className="lg:col-span-8 bg-card border border-border rounded-2xl p-6 shadow-sm">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h3 className="text-lg font-bold tracking-tight">Margin Yield by Product</h3>
              <p className="text-xs text-muted-foreground uppercase tracking-wider font-bold mt-0.5">Contribution per Unit Comparison</p>
            </div>
          </div>
          <div className="h-[350px]">
             <ResponsiveContainer width="100%" height="100%">
               <ComposedChart data={marginByProduct}>
                 <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                 <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: 'hsl(var(--muted-foreground))', fontSize: 10}} dy={10} />
                 <YAxis yAxisId="left" axisLine={false} tickLine={false} tick={{fill: 'hsl(var(--muted-foreground))', fontSize: 10}} />
                 <YAxis yAxisId="right" orientation="right" axisLine={false} tickLine={false} tick={{fill: 'hsl(var(--primary))', fontSize: 10}} />
                 <Tooltip contentStyle={{ borderRadius: '12px', border: '1px solid hsl(var(--border))' }} />
                 <Bar yAxisId="left" dataKey="margin" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} barSize={40} />
                 <Line yAxisId="right" type="monotone" dataKey="marginPerLiter" stroke="hsl(var(--chart-2))" strokeWidth={3} dot={{ r: 4, fill: 'white', stroke: 'hsl(var(--chart-2))', strokeWidth: 2 }} />
               </ComposedChart>
             </ResponsiveContainer>
          </div>
        </div>

        {/* Insights & Price Impact */}
        <div className="lg:col-span-4 space-y-6">
          <div className="bg-card border border-border rounded-2xl p-6 shadow-sm">
             <h3 className="text-sm font-black uppercase tracking-widest text-primary mb-6 flex items-center gap-2">
               <Target size={16} />
               Price Impact Model
             </h3>
             <div className="space-y-4">
                <div className="flex items-center justify-between">
                   <span className="text-xs text-muted-foreground">Volume Baseline</span>
                   <span className="text-xs font-bold">50,000 L</span>
                </div>
                <div className="p-4 bg-muted/20 rounded-xl border border-border space-y-3">
                   <div className="flex justify-between items-center">
                      <span className="text-[10px] uppercase font-bold text-muted-foreground">Rev. Impact</span>
                      <span className="text-sm font-black text-emerald-600">+$5,000</span>
                   </div>
                   <div className="flex justify-between items-center">
                      <span className="text-[10px] uppercase font-bold text-muted-foreground">Margin Delta</span>
                      <span className="text-sm font-black text-emerald-600">+$5,000</span>
                   </div>
                   <div className="pt-2 border-t border-border/50 flex items-center gap-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></div>
                      <span className="text-[9px] text-muted-foreground italic">Projection based on fixed volume elastic model.</span>
                   </div>
                </div>
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      await reportActionMutation.mutateAsync();
                      addToast('Sensitivity simulation (price/volume) queued', 'info');
                    } catch (err: any) {
                      addToast(err?.apiError?.message ?? err?.message ?? 'Failed to run sensitivity simulation', 'error');
                    }
                  }}
                  className="w-full py-2 bg-muted text-foreground text-[10px] font-black uppercase tracking-widest rounded-lg hover:bg-muted/80 transition-colors"
                >
                  Run Sensitivity Simulation
                </button>
             </div>
          </div>

          <div className="bg-slate-900 text-white rounded-2xl p-6 shadow-xl relative overflow-hidden group">
            <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:scale-110 transition-transform">
               <TrendingUp size={80} />
            </div>
            <h3 className="text-sm font-bold uppercase tracking-widest mb-4 flex items-center gap-2">
              <Percent size={16} className="text-emerald-400" />
              Strategic Insights
            </h3>
            <div className="space-y-4">
               {insights.map((insight, i) => (
                 <div key={i} className="flex gap-3">
                   <div className={`w-1 h-auto rounded-full ${insight.type === 'warning' ? 'bg-amber-500' : insight.type === 'positive' ? 'bg-emerald-500' : 'bg-blue-500'}`}></div>
                   <div>
                     <p className="text-[10px] font-black uppercase opacity-60 mb-0.5">{insight.label}</p>
                     <p className="text-[11px] leading-relaxed text-slate-300 font-medium">{insight.text}</p>
                   </div>
                 </div>
               ))}
            </div>
          </div>
        </div>
      </div>

      {/* Station Contribution Table */}
      <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-sm">
        <div className="p-6 border-b border-border bg-muted/10 flex items-center justify-between">
           <h3 className="text-sm font-bold uppercase tracking-wider flex items-center gap-2">
             <Scale size={18} className="text-primary" />
             Contribution Margin by Station (Proportional Allocation)
           </h3>
           <div className="flex items-center gap-2 px-3 py-1 bg-white border border-border rounded-full text-[10px] font-bold">
              <Info size={10} className="text-primary" />
              Opex Allocated by Revenue Weight
           </div>
        </div>
        {profitabilityQuery.isLoading ? <TableSkeleton /> : (
           <IFMSDataTable 
             data={stationProfit}
             onRowClick={(row) => setDrilldown({ ...row, type: 'Station Details' })}
             columns={[
               { header: 'Station', accessorKey: 'name' },
               { header: 'Revenue ($)', accessorKey: 'revenue', cell: (s: any) => s.revenue.toLocaleString() },
               { header: 'Gross Margin ($)', accessorKey: 'grossMargin', cell: (s: any) => s.grossMargin.toLocaleString() },
               { header: 'Alloc. OpEx ($)', accessorKey: 'allocatedOpEx', cell: (s: any) => s.allocatedOpEx.toLocaleString(undefined, { maximumFractionDigits: 0 }) },
               { header: 'Net Contribution ($)', accessorKey: 'contribution', cell: (s: any) => (
                 <span className={`font-black ${s.contribution < 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                   ${s.contribution.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                 </span>
               )},
               { header: 'Margin %', accessorKey: 'marginPct', cell: (s: any) => (
                 <div className="flex items-center gap-2">
                   <div className="w-12 h-1.5 bg-muted rounded-full overflow-hidden">
                     <div className="h-full bg-primary" style={{ width: `${s.marginPct}%` }} />
                   </div>
                   <span className="font-bold text-[10px]">{s.marginPct.toFixed(1)}%</span>
                 </div>
               )}
             ]}
           />
        )}
      </div>

      {/* Drilldown Drawer */}
      <DetailsDrawer 
        isOpen={!!drilldown} 
        onClose={() => setDrilldown(null)}
        title="Profitability Drilldown"
        subtitle={`${drilldown?.name || 'Analysis'} • Contribution Deep Dive`}
      >
        <div className="space-y-8">
           <div className="bg-primary/5 border border-primary/20 p-6 rounded-2xl flex items-center justify-between">
              <div>
                 <p className="text-[10px] font-black uppercase text-primary/60 mb-1 tracking-widest">Net Contribution</p>
                 <p className="text-3xl font-black text-primary">${drilldown?.contribution.toLocaleString()}</p>
              </div>
              <div className="p-3 bg-white rounded-xl shadow-sm">
                 <ArrowUpRight size={24} className="text-primary" />
              </div>
           </div>

           <div className="space-y-4">
              <h4 className="text-xs font-black uppercase tracking-widest text-muted-foreground border-b border-border pb-2">Financial Breakdown</h4>
              <div className="space-y-3">
                 <div className="flex justify-between items-center text-sm">
                    <span className="text-muted-foreground flex items-center gap-2">
                       <DollarSign size={14} className="text-muted-foreground/50" />
                       Total Sales Revenue
                    </span>
                    <span className="font-bold">${drilldown?.revenue.toLocaleString()}</span>
                 </div>
                 <div className="flex justify-between items-center text-sm">
                    <span className="text-muted-foreground flex items-center gap-2">
                       <PackageCheck size={14} className="text-muted-foreground/50" />
                       COGS (Estimated)
                    </span>
                    <span className="font-bold">-${(drilldown?.revenue - drilldown?.grossMargin).toLocaleString()}</span>
                 </div>
                 <div className="flex justify-between items-center text-sm">
                    <span className="text-muted-foreground flex items-center gap-2">
                       <TrendingUp size={14} className="text-muted-foreground/50" />
                       Gross Margin
                    </span>
                    <span className="font-bold">${drilldown?.grossMargin.toLocaleString()}</span>
                 </div>
                 <div className="flex justify-between items-center text-sm">
                    <span className="text-muted-foreground flex items-center gap-2 text-rose-500/80">
                       <FileText size={14} />
                       Allocated Operating Expenses
                    </span>
                    <span className="font-bold text-rose-600">-${drilldown?.allocatedOpEx.toLocaleString()}</span>
                 </div>
              </div>
           </div>

           <div className="p-4 bg-muted/30 rounded-xl border border-dashed border-border text-center">
              <p className="text-xs text-muted-foreground italic leading-relaxed">
                "Contribution Margin 2 (CM2) analysis for this location shows efficiency above national average. Recommend increasing marketing allocation for high-margin products."
              </p>
           </div>

           <div className="pt-6">
              <button type="button" onClick={() => { addToast('Detailed P&L export started', 'success'); window.print(); }} className="w-full py-3 bg-primary text-white font-bold rounded-xl shadow-lg shadow-primary/20 text-sm">Export Detailed P&L</button>
           </div>
        </div>
      </DetailsDrawer>
    </div>
  );
};

export default ProfitabilityReport;
