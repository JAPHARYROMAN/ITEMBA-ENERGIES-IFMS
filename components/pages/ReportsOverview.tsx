
import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { 
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  BarChart, Bar, Cell, PieChart, Pie
} from 'recharts';
import { apiReports } from '../../lib/api/reports';
import PageHeader from '../ifms/PageHeader';
import StatCard from '../ifms/StatCard';
import ReportFilters from '../reports/ReportFilters';
import { DashboardSkeleton } from '../ifms/Skeletons';
import { useAppStore } from '../../store';
import { useReportsStore } from '../../store';
import { downloadCSV } from '../../lib/exportUtils';
import { TrendingUp, AlertTriangle, Users } from 'lucide-react';

const ReportsOverview: React.FC = () => {
  const { addToast } = useAppStore();
  const { stationId, productId, dateRange } = useReportsStore();
  const filters = {
    dateFrom: dateRange.from,
    dateTo: dateRange.to,
    stationId: stationId ?? undefined,
    productId: productId ?? undefined,
  };
  const overviewQuery = useQuery({
    queryKey: ['reports-overview', filters],
    queryFn: () => apiReports.overview(filters) as Promise<any>,
  });

  const isLoading = overviewQuery.isLoading;

  if (isLoading) return <DashboardSkeleton />;

  const kpis = overviewQuery.data?.kpis;
  const salesTrend = overviewQuery.data?.salesTrend ?? [];
  const paymentMix = overviewQuery.data?.paymentMix ?? [];
  const varianceByStation = overviewQuery.data?.varianceByStation ?? [];
  const topDebtors = overviewQuery.data?.topDebtors ?? [];

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-700 pb-12">
      <PageHeader 
        title="Enterprise Analytics" 
        description="Unified operational and financial performance overview."
        actions={
          <button type="button" onClick={() => { const k = kpis; if (k) downloadCSV('monthly-summary.csv', ['Metric', 'Value', 'Change'], [['Total Revenue', k.totalSales?.value, k.totalSales?.change], ['Fuel Volume (L)', k.litersSold?.value, k.litersSold?.change], ['Gross Margin', k.grossMargin?.value, k.grossMargin?.change], ['Shrinkage %', k.shrinkage?.value, k.shrinkage?.change], ['Overdue AR', k.receivables?.value, k.receivables?.change], ['Overdue AP', k.payables?.value, k.payables?.change]]); addToast('Monthly summary exported', 'success'); }} className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-bold shadow-lg shadow-primary/20 hover:opacity-90">
            Export Monthly Summary
          </button>
        }
      />

      <ReportFilters />

      {/* KPI Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        <StatCard label="Total Revenue" value={`$${kpis?.totalSales.value.toLocaleString()}`} delta={kpis?.totalSales.change} trend={kpis?.totalSales.trend as any} />
        <StatCard label="Fuel Volume" value={`${kpis?.litersSold.value.toLocaleString()} L`} delta={kpis?.litersSold.change} trend={kpis?.litersSold.trend as any} />
        <StatCard label="Gross Margin" value={`$${kpis?.grossMargin.value.toLocaleString()}`} delta={kpis?.grossMargin.change} trend={kpis?.grossMargin.trend as any} />
        <StatCard label="Shrinkage Rate" value={`${kpis?.shrinkage.value}%`} delta={kpis?.shrinkage.change} trend={kpis?.shrinkage.trend as any} />
        <StatCard label="Overdue AR" value={`$${kpis?.receivables.value.toLocaleString()}`} delta={kpis?.receivables.change} trend={kpis?.receivables.trend as any} />
        <StatCard label="Overdue AP" value={`$${kpis?.payables.value.toLocaleString()}`} delta={kpis?.payables.change} trend={kpis?.payables.trend as any} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Main Sales Trend */}
        <div className="lg:col-span-8 bg-card border border-border rounded-2xl p-6 shadow-sm">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h3 className="text-lg font-bold tracking-tight">Revenue Dynamics</h3>
              <p className="text-xs text-muted-foreground uppercase tracking-wider font-bold mt-0.5">Rolling 7-Day Performance</p>
            </div>
            <div className="flex items-center gap-2">
              <span className="flex items-center gap-1 text-[10px] font-bold px-2 py-1 bg-emerald-500/10 text-emerald-600 rounded">
                <TrendingUp size={10} />
                +14% VS LW
              </span>
            </div>
          </div>
          <div className="h-[350px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={salesTrend}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{fill: 'hsl(var(--muted-foreground))', fontSize: 10}} dy={10} />
                <YAxis axisLine={false} tickLine={false} tick={{fill: 'hsl(var(--muted-foreground))', fontSize: 10}} />
                <Tooltip 
                  contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '12px', fontSize: '11px' }}
                />
                <Line type="monotone" dataKey="amount" stroke="hsl(var(--primary))" strokeWidth={3} dot={{ r: 4, fill: 'hsl(var(--primary))', strokeWidth: 2, stroke: 'white' }} activeDot={{ r: 6 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Payment Methods */}
        <div className="lg:col-span-4 bg-card border border-border rounded-2xl p-6 shadow-sm">
          <h3 className="text-lg font-bold tracking-tight mb-8">Payment Mix</h3>
          <div className="h-[300px]">
             <ResponsiveContainer width="100%" height="100%">
                <BarChart data={paymentMix} layout="vertical">
                   <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="hsl(var(--border))" />
                   <XAxis type="number" hide />
                   <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} tick={{fill: 'hsl(var(--foreground))', fontSize: 11, fontWeight: 'bold'}} />
                   <Tooltip cursor={{fill: 'transparent'}} contentStyle={{ borderRadius: '8px' }} />
                   <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                      {paymentMix?.map((_: any, index: number) => (
                        <Cell key={index} fill={['hsl(var(--chart-1))', 'hsl(var(--chart-2))', 'hsl(var(--chart-3))'][index % 3]} />
                      ))}
                   </Bar>
                </BarChart>
             </ResponsiveContainer>
          </div>
          <div className="mt-6 space-y-2">
            {paymentMix?.map((p: any, i: number) => (
              <div key={i} className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">{p.name}</span>
                <span className="font-bold">${p.value.toLocaleString()}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top Variance Stations */}
        <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-sm">
          <div className="p-6 border-b border-border bg-muted/20 flex items-center justify-between">
            <div className="flex items-center gap-2">
               <AlertTriangle size={18} className="text-amber-500" />
               <h3 className="text-sm font-bold uppercase tracking-wider">Inventory Variance Monitor</h3>
            </div>
          </div>
          <table className="w-full text-left">
            <thead className="bg-muted/50 text-[10px] font-bold text-muted-foreground uppercase tracking-widest border-b border-border">
              <tr>
                <th className="px-6 py-3">Station</th>
                <th className="px-6 py-3 text-right">Variance (L)</th>
                <th className="px-6 py-3 text-right">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {varianceByStation?.map((v: any, i: number) => (
                <tr key={i} className="text-xs hover:bg-muted/30 transition-colors">
                  <td className="px-6 py-4 font-bold">{v.station}</td>
                  <td className={`px-6 py-4 text-right font-bold ${Number(v.variance) < 0 ? 'text-rose-500' : 'text-emerald-500'}`}>{v.variance}</td>
                  <td className="px-6 py-4 text-right">
                    <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-tighter ${v.status === 'Critical' ? 'bg-rose-500 text-white' : 'bg-muted text-muted-foreground'}`}>
                      {v.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Top Debtors */}
        <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-sm">
          <div className="p-6 border-b border-border bg-muted/20 flex items-center justify-between">
            <div className="flex items-center gap-2">
               <Users size={18} className="text-primary" />
               <h3 className="text-sm font-bold uppercase tracking-wider">Top Credit Risk Exposure</h3>
            </div>
          </div>
          <table className="w-full text-left">
            <thead className="bg-muted/50 text-[10px] font-bold text-muted-foreground uppercase tracking-widest border-b border-border">
              <tr>
                <th className="px-6 py-3">Customer</th>
                <th className="px-6 py-3 text-right">Balance</th>
                <th className="px-6 py-3 text-right">Limit Util.</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {topDebtors?.map((d: any, i: number) => (
                <tr key={i} className="text-xs hover:bg-muted/30 transition-colors">
                  <td className="px-6 py-4 font-bold">{d.name}</td>
                  <td className="px-6 py-4 text-right font-bold">${d.balance.toLocaleString()}</td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
                        <div 
                          className={`h-full ${Number(d.utilization) > 85 ? 'bg-rose-500' : 'bg-primary'}`} 
                          style={{ width: `${d.utilization}%` }}
                        />
                      </div>
                      <span className="font-bold text-[10px]">{d.utilization}%</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default ReportsOverview;
