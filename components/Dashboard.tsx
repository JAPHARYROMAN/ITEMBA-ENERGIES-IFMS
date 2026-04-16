import React from 'react';
import {
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  AreaChart,
  Area,
} from 'recharts';
import { useQuery } from '@tanstack/react-query';
import StatCard from './ifms/StatCard';
import PageHeader from './ifms/PageHeader';
import DataTableShell from './ifms/DataTableShell';
import FilterBar from './ifms/FilterBar';
import { DashboardSkeleton } from './ifms/Skeletons';
import { saleRepo, expenseRepo } from '../lib/repositories';
import { useAppStore } from '../store';
import { triggerPrint } from '../lib/exportUtils';
import { useCurrency } from '../lib/hooks/useCurrency';
import { FileDown, FileBarChart } from 'lucide-react';
import { DASHBOARD_CHART_MONTHS } from '../lib/constants';
import { useTranslation } from 'react-i18next';

const Dashboard: React.FC = () => {
  const { t } = useTranslation();
  const { addToast } = useAppStore();
  const { fmt, fmtCompact } = useCurrency();
  const salesQuery = useQuery({ queryKey: ['sales'], queryFn: saleRepo.list });
  const expensesQuery = useQuery({ queryKey: ['expenses'], queryFn: expenseRepo.list });

  const chartData = React.useMemo(() => {
    const monthMap = new Map<string, { month: string; budget: number; actual: number }>();

    (salesQuery.data ?? []).forEach((sale) => {
      const d = new Date(sale.timestamp);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const month = d.toLocaleString('default', { month: 'short' });
      const existing = monthMap.get(key) ?? { month, budget: 0, actual: 0 };
      existing.actual += sale.totalAmount;
      monthMap.set(key, existing);
    });

    (expensesQuery.data ?? []).forEach((expense) => {
      const d = new Date(expense.timestamp);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const month = d.toLocaleString('default', { month: 'short' });
      const existing = monthMap.get(key) ?? { month, budget: 0, actual: 0 };
      existing.budget += expense.amount;
      monthMap.set(key, existing);
    });

    return Array.from(monthMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-DASHBOARD_CHART_MONTHS)
      .map(([, v]) => v);
  }, [salesQuery.data, expensesQuery.data]);

  const isLoading = salesQuery.isLoading || expensesQuery.isLoading;

  if (isLoading) return <DashboardSkeleton />;

  const totalRevenue = salesQuery.data?.reduce((acc, s) => acc + s.totalAmount, 0) || 0;
  const totalExpenses = expensesQuery.data?.reduce((acc, e) => acc + e.amount, 0) || 0;
  const netProfit = totalRevenue - totalExpenses;
  const availableLiquidity = Math.max(0, netProfit);

  const metrics = [
    {
      label: t('dashboard.totalRevenue'),
      value: fmtCompact(totalRevenue),
      change: 12.5,
      trend: 'up',
      color: 'blue',
    },
    {
      label: t('dashboard.operatingExpenses'),
      value: fmtCompact(totalExpenses),
      change: -3.2,
      trend: 'down',
      color: 'red',
    },
    {
      label: t('dashboard.netProfit'),
      value: fmtCompact(netProfit),
      change: 8.4,
      trend: 'up',
      color: 'emerald',
    },
    {
      label: t('dashboard.availableLiquidity'),
      value: fmtCompact(availableLiquidity),
      change: 2.1,
      trend: 'up',
      color: 'indigo',
    },
  ];

  const handleExport = () => {
    addToast(t('dashboard.printDialogInfo'), 'info');
    triggerPrint();
  };

  const handleReport = () => {
    const reportHtml = `
      <!DOCTYPE html><html><head><title>IFMS Executive Summary</title><style>body{font-family:system-ui,sans-serif;padding:2rem;max-width:800px;margin:0 auto} table{width:100%;border-collapse:collapse} th,td{padding:8px 12px;text-align:left;border-bottom:1px solid #eee} th{background:#f5f5f5}</style></head><body>
      <h1>${t('dashboard.executiveSummary')}</h1>
      <p>Generated ${new Date().toLocaleString()}</p>
      <table><tr><th>Metric</th><th>Value</th></tr>
      ${metrics.map((m) => `<tr><td>${m.label}</td><td>${m.value}</td></tr>`).join('')}
      </table>
      <p style="margin-top:2rem;color:#666;font-size:12px">${t('dashboard.operationalReport')}</p>
      </body></html>`;
    const w = window.open('', '_blank');
    if (w) {
      w.document.write(reportHtml);
      w.document.close();
      addToast(t('dashboard.reportNewTab'), 'success');
    } else {
      addToast(t('dashboard.allowPopups'), 'info');
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-500">
      <PageHeader
        title={t('dashboard.title')}
        description={t('dashboard.description')}
        actions={
          <>
            <button
              onClick={handleExport}
              aria-label={t('dashboard.exportPdf')}
              className="flex items-center gap-2 px-5 py-2.5 bg-secondary text-secondary-foreground rounded-xl text-xs font-black uppercase tracking-widest hover:opacity-90 transition-all border border-border"
            >
              <FileDown size={14} /> Export PDF
            </button>
            <button
              onClick={handleReport}
              aria-label="Generate executive report"
              className="flex items-center gap-2 px-6 py-2.5 bg-primary text-primary-foreground rounded-xl text-xs font-black uppercase tracking-widest shadow-lg shadow-primary/20 hover:opacity-90 transition-all"
            >
              <FileBarChart size={14} /> Generate Report
            </button>
          </>
        }
      />

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {metrics.map((metric, i) => (
          <StatCard
            key={i}
            label={metric.label}
            value={metric.value}
            delta={metric.change}
            trend={metric.trend as 'up' | 'down' | 'neutral'}
          />
        ))}
      </div>

      <div className="grid grid-cols-1 gap-8">
        <div className="bg-card text-card-foreground p-8 rounded-[2rem] border border-border shadow-sm">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h3 className="text-xl font-black tracking-tight">{t('dashboard.budgetVsActual')}</h3>
              <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-widest mt-1">
                {t('dashboard.budgetVsActualDesc')}
              </p>
            </div>
          </div>
          <div className="h-[350px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="colorBudget" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--chart-1))" stopOpacity={0.1} />
                    <stop offset="95%" stopColor="hsl(var(--chart-1))" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="colorActual" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--chart-2))" stopOpacity={0.1} />
                    <stop offset="95%" stopColor="hsl(var(--chart-2))" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                <XAxis
                  dataKey="month"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10, fontWeight: 'bold' }}
                  dy={10}
                />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10, fontWeight: 'bold' }}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'hsl(var(--popover))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '1rem',
                    color: 'hsl(var(--popover-foreground))',
                    fontSize: '11px',
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="budget"
                  stroke="hsl(var(--chart-1))"
                  strokeWidth={3}
                  fillOpacity={1}
                  fill="url(#colorBudget)"
                />
                <Area
                  type="monotone"
                  dataKey="actual"
                  stroke="hsl(var(--chart-2))"
                  strokeWidth={3}
                  fillOpacity={1}
                  fill="url(#colorActual)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <DataTableShell
        title={t('dashboard.recentTransactions')}
        toolbar={<FilterBar showDate={false} />}
        footer={
          <div className="text-[10px] text-muted-foreground text-center font-black uppercase tracking-widest py-2">
            {t('dashboard.viewingEntries', { count: salesQuery.data?.length || 0 })}
          </div>
        }
      >
        <table className="w-full text-left">
          <thead className="bg-muted/50 text-muted-foreground text-[10px] uppercase font-black tracking-[0.2em] border-b border-border">
            <tr>
              <th className="px-6 py-5">{t('dashboard.transactionId')}</th>
              <th className="px-6 py-5">{t('dashboard.payment')}</th>
              <th className="px-6 py-5">{t('common.status')}</th>
              <th className="px-6 py-5">{t('dashboard.timestamp')}</th>
              <th className="px-6 py-5 text-right">{t('common.amount')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60">
            {salesQuery.data?.slice(0, 5).map((row, i) => (
              <tr
                key={i}
                className="hover:bg-primary/[0.02] transition-colors group cursor-pointer"
              >
                <td className="px-6 py-5 font-black text-foreground uppercase tracking-tighter text-sm">
                  {row.id}
                </td>
                <td className="px-6 py-5 text-muted-foreground font-bold text-xs">
                  {row.paymentType}
                </td>
                <td className="px-6 py-5">
                  <span
                    className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-400 border border-emerald-200/50`}
                  >
                    {t('dashboard.completed')}
                  </span>
                </td>
                <td className="px-6 py-5 text-muted-foreground text-[11px] font-medium">
                  {new Date(row.timestamp).toLocaleString()}
                </td>
                <td className={`px-6 py-5 text-right font-black text-foreground text-sm`}>
                  {fmt(row.totalAmount)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </DataTableShell>
    </div>
  );
};

export default Dashboard;
