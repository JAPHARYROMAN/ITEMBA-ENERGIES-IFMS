import React from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  Cell,
} from 'recharts';
import { apiReports } from '../../lib/api/reports';
import PageHeader from '../ifms/PageHeader';
import StatCard from '../ifms/StatCard';
import ReportFilters from '../reports/ReportFilters';
import { DashboardSkeleton } from '../ifms/Skeletons';
import { useReportsStore } from '../../store';
import { TrendingUp, AlertTriangle, Users } from 'lucide-react';
import { ExportButton } from '../ifms/ExportButton';
import { useCurrency } from '../../lib/hooks/useCurrency';

type TrendDirection = 'up' | 'down' | 'neutral';

interface KpiMetric {
  value: number;
  change: number;
  trend: TrendDirection;
}

interface OverviewKpis {
  totalSales: KpiMetric;
  litersSold: KpiMetric;
  grossMargin: KpiMetric;
  shrinkage: KpiMetric;
  receivables: KpiMetric;
  payables: KpiMetric;
}

interface SalesTrendPoint {
  date: string;
  amount: number;
}

interface PaymentMixEntry {
  name: string;
  value: number;
}

interface VarianceByStationRow {
  station: string;
  variance: number;
  status: string;
}

interface TopDebtorRow {
  name: string;
  balance: number;
  utilization: number;
}

interface OverviewResponse {
  kpis: OverviewKpis;
  salesTrend: SalesTrendPoint[];
  paymentMix: PaymentMixEntry[];
  varianceByStation: VarianceByStationRow[];
  topDebtors: TopDebtorRow[];
}

const ReportsOverview: React.FC = () => {
  const { t } = useTranslation();
  const { fmtCompact } = useCurrency();
  const { stationId, productId, dateRange } = useReportsStore();
  const filters = {
    dateFrom: dateRange.from,
    dateTo: dateRange.to,
    stationId: stationId ?? undefined,
    productId: productId ?? undefined,
  };
  const overviewQuery = useQuery({
    queryKey: ['reports-overview', filters],
    queryFn: () => apiReports.overview(filters) as Promise<OverviewResponse>,
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
        title={t('pages.reportsTitle')}
        description={t('pages.reportsDesc')}
        actions={
          <ExportButton exportType="reports.overview" params={filters} label={t('common.export')} />
        }
      />

      <ReportFilters />

      {/* KPI Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        <StatCard
          label="Total Revenue"
          value={fmtCompact(kpis?.totalSales.value ?? 0)}
          delta={kpis?.totalSales.change}
          trend={kpis?.totalSales.trend}
        />
        <StatCard
          label="Fuel Volume"
          value={`${kpis?.litersSold.value.toLocaleString()} L`}
          delta={kpis?.litersSold.change}
          trend={kpis?.litersSold.trend}
        />
        <StatCard
          label="Gross Margin"
          value={fmtCompact(kpis?.grossMargin.value ?? 0)}
          delta={kpis?.grossMargin.change}
          trend={kpis?.grossMargin.trend}
        />
        <StatCard
          label="Shrinkage Rate"
          value={`${kpis?.shrinkage.value}%`}
          delta={kpis?.shrinkage.change}
          trend={kpis?.shrinkage.trend}
        />
        <StatCard
          label="Overdue AR"
          value={fmtCompact(kpis?.receivables.value ?? 0)}
          delta={kpis?.receivables.change}
          trend={kpis?.receivables.trend}
        />
        <StatCard
          label="Overdue AP"
          value={fmtCompact(kpis?.payables.value ?? 0)}
          delta={kpis?.payables.change}
          trend={kpis?.payables.trend}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Main Sales Trend */}
        <div className="lg:col-span-8 bg-card border border-border rounded-2xl p-6 shadow-sm">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h3 className="text-lg font-bold tracking-tight">Revenue Dynamics</h3>
              <p className="text-xs text-muted-foreground uppercase tracking-wider font-bold mt-0.5">
                Rolling 7-Day Performance
              </p>
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
                <XAxis
                  dataKey="date"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }}
                  dy={10}
                />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'hsl(var(--card))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '12px',
                    fontSize: '11px',
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="amount"
                  stroke="hsl(var(--primary))"
                  strokeWidth={3}
                  dot={{ r: 4, fill: 'hsl(var(--primary))', strokeWidth: 2, stroke: 'white' }}
                  activeDot={{ r: 6 }}
                />
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
                <CartesianGrid
                  strokeDasharray="3 3"
                  horizontal={false}
                  stroke="hsl(var(--border))"
                />
                <XAxis type="number" hide />
                <YAxis
                  dataKey="name"
                  type="category"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: 'hsl(var(--foreground))', fontSize: 11, fontWeight: 'bold' }}
                />
                <Tooltip cursor={{ fill: 'transparent' }} contentStyle={{ borderRadius: '8px' }} />
                <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                  {paymentMix?.map((_, index) => (
                    <Cell
                      key={index}
                      fill={
                        ['hsl(var(--chart-1))', 'hsl(var(--chart-2))', 'hsl(var(--chart-3))'][
                          index % 3
                        ]
                      }
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-6 space-y-2">
            {paymentMix?.map((p, i) => (
              <div key={i} className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">{p.name}</span>
                <span className="font-bold">{fmtCompact(p.value)}</span>
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
              <h3 className="text-sm font-bold uppercase tracking-wider">
                Inventory Variance Monitor
              </h3>
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
              {varianceByStation?.map((v, i) => (
                <tr key={i} className="text-xs hover:bg-muted/30 transition-colors">
                  <td className="px-6 py-4 font-bold">{v.station}</td>
                  <td
                    className={`px-6 py-4 text-right font-bold ${Number(v.variance) < 0 ? 'text-rose-500' : 'text-emerald-500'}`}
                  >
                    {v.variance}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <span
                      className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-tighter ${v.status === 'Critical' ? 'bg-rose-500 text-white' : 'bg-muted text-muted-foreground'}`}
                    >
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
              <h3 className="text-sm font-bold uppercase tracking-wider">
                Top Credit Risk Exposure
              </h3>
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
              {topDebtors?.map((d, i) => (
                <tr key={i} className="text-xs hover:bg-muted/30 transition-colors">
                  <td className="px-6 py-4 font-bold">{d.name}</td>
                  <td className="px-6 py-4 text-right font-bold">{fmtCompact(d.balance)}</td>
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
