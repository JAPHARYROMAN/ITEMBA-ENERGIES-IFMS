
import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { expenseRepo } from '../../lib/repositories';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { downloadCSV } from '../../lib/exportUtils';
import { Info, Download } from 'lucide-react';

const COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#3b82f6'];

export const ExpenseSummaryDrawer: React.FC = () => {
  const { data: expenses, isLoading } = useQuery({ queryKey: ['expenses'], queryFn: expenseRepo.list });

  const summary = React.useMemo(() => {
    if (!expenses) return [];
    const grouped = expenses.reduce((acc: any, curr) => {
      acc[curr.category] = (acc[curr.category] || 0) + curr.amount;
      return acc;
    }, {});
    return Object.entries(grouped).map(([name, value]) => ({ name, value: value as number }));
  }, [expenses]);

  const total = summary.reduce((acc, curr) => acc + curr.value, 0);

  if (isLoading) return <div className="p-12 text-center animate-pulse opacity-40 font-black">Analyzing Ledger...</div>;

  return (
    <div className="p-8 space-y-10">
      <div className="flex items-center justify-between">
         <div>
            <h3 className="text-xl font-black tracking-tight">Fiscal Distribution</h3>
            <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-widest mt-1">Current Billing Cycle • Monthly Aggregation</p>
         </div>
         <button
            type="button"
            onClick={() => {
              const headers = ['Category', 'Amount', 'Share %'];
              const rows = summary.map((item) => [
                item.name,
                item.value,
                total ? `${((item.value / total) * 100).toFixed(1)}%` : '0%'
              ]);
              downloadCSV(`expense-summary-${new Date().toISOString().slice(0, 10)}.csv`, headers, rows);
            }}
            className="p-2 hover:bg-muted rounded-xl border border-border text-muted-foreground transition-colors"
            title="Download as CSV"
          >
            <Download size={18} />
         </button>
      </div>

      <div className="h-[250px]">
         <ResponsiveContainer width="100%" height="100%">
            <PieChart>
               <Pie
                  data={summary}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={80}
                  paddingAngle={5}
                  dataKey="value"
               >
                  {summary.map((_, index) => (
                     <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} strokeWidth={0} />
                  ))}
               </Pie>
               <Tooltip contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0', fontSize: '12px' }} />
            </PieChart>
         </ResponsiveContainer>
      </div>

      <div className="space-y-4">
         <div className="flex items-center justify-between border-b border-border pb-2">
            <h4 className="text-[10px] font-black uppercase text-primary tracking-widest">Category Totals</h4>
            <span className="text-[10px] font-bold text-muted-foreground uppercase">Weight %</span>
         </div>
         <div className="space-y-4">
            {summary.map((item, i) => (
              <div key={i} className="flex items-center justify-between group">
                 <div className="flex items-center gap-3">
                    <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }}></div>
                    <span className="text-xs font-bold text-muted-foreground group-hover:text-foreground transition-colors">{item.name}</span>
                 </div>
                 <div className="text-right">
                    <p className="text-xs font-black">${item.value.toLocaleString()}</p>
                    <p className="text-[9px] text-muted-foreground font-bold">{((item.value / total) * 100).toFixed(1)}%</p>
                 </div>
              </div>
            ))}
         </div>
      </div>

      <div className="bg-primary/5 border border-primary/10 rounded-2xl p-6 flex items-start gap-4">
         <div className="p-2 bg-white rounded-xl shadow-sm text-primary">
            <Info size={18} />
         </div>
         <div className="space-y-1">
            <h5 className="text-xs font-bold">Trend Observation</h5>
            <p className="text-[11px] text-muted-foreground leading-relaxed italic">
               "Maintenance costs for this cycle have increased by 14% compared to the 90-day baseline, primarily due to equipment upgrades in Lubricant Bay."
            </p>
         </div>
      </div>
    </div>
  );
};
