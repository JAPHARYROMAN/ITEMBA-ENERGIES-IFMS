
import React, { useState, useMemo } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { apiReports } from '../../lib/api/reports';
import { postCustomerAction, postReportAction } from '../../lib/api/actions';
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
  PieChart, Pie, Cell, Legend
} from 'recharts';
import { 
  Wallet, 
  ArrowUpRight, 
  ArrowDownRight, 
  Clock, 
  UserCheck, 
  Calendar,
  DollarSign,
  Briefcase,
  AlertCircle,
  FileText,
  Phone,
  Mail,
  Zap
} from 'lucide-react';
import { DashboardSkeleton, TableSkeleton } from '../ifms/Skeletons';

const CreditCashflowReport: React.FC = () => {
  const { addToast } = useAppStore();
  const { stationId, productId, dateRange } = useReportsStore();
  const [selectedDebtor, setSelectedDebtor] = useState<any>(null);
  const [sortRecentFirst, setSortRecentFirst] = useState(true);
  const bulkReminderMutation = useMutation({
    mutationFn: () => postReportAction('bulk-reminders', { payload: { stationId, productId } }),
  });
  const customerActionMutation = useMutation({
    mutationFn: (payload: { customerId: string; action: 'send-payment-link' | 'escalate-legal' }) =>
      postCustomerAction(payload.customerId, payload.action === 'send-payment-link' ? 'send-payment-link' : 'escalate-legal'),
  });
  const filters = {
    dateFrom: dateRange.from,
    dateTo: dateRange.to,
    stationId: stationId ?? undefined,
    productId: productId ?? undefined,
  };
  const creditQuery = useQuery({
    queryKey: ['credit-cashflow-report', filters],
    queryFn: () => apiReports.creditCashflow(filters) as Promise<any>,
  });
  const arAging = creditQuery.data?.arAging ?? [];
  const apAging = creditQuery.data?.apAging ?? [];
  const sim = creditQuery.data?.simulation;
  const debtors = creditQuery.data?.topDebtors ?? [];

  const sortedDebtors = useMemo(() => {
    const d = debtors || [];
    return sortRecentFirst ? [...d] : [...d].sort((a: any, b: any) => (b.balance || 0) - (a.balance || 0));
  }, [debtors, sortRecentFirst]);

  if (creditQuery.isLoading) return <DashboardSkeleton />;

  return (
    <div className="space-y-8 animate-in fade-in duration-700 pb-12">
      <PageHeader 
        title="Credit & Cashflow Intelligence" 
        description="Strategic visibility into corporate liquidity, collection efficiency, and vendor obligations."
        actions={
          <div className="flex gap-2">
            <button
              type="button"
              onClick={async () => {
                try {
                  await bulkReminderMutation.mutateAsync();
                  addToast('Bulk payment reminders queued for delivery', 'success');
                } catch (err: any) {
                  addToast(err?.apiError?.message ?? err?.message ?? 'Failed to queue reminders', 'error');
                }
              }}
              className="px-4 py-2 bg-secondary text-secondary-foreground border border-border rounded-lg text-sm font-bold hover:opacity-90"
            >
              Bulk Reminders
            </button>
            <button type="button" onClick={() => { downloadCSV('ar-statement.csv', ['Customer', 'Outstanding', 'Limit', 'Utilization', 'Last PMT', 'Status'], sortedDebtors.map((d: any) => [d.name, d.balance, d.limit, `${d.utilization}%`, d.lastPayment, d.status])); addToast('AR statement downloaded', 'success'); }} className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-bold shadow-lg shadow-primary/20 hover:opacity-90">
              Download AR Statement
            </button>
          </div>
        }
      />

      <ReportFilters />

      {/* High-Level Liquidity Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard label="Current Liquidity" value={`$${sim?.opening.toLocaleString()}`} delta={2.1} trend="up" />
        <StatCard label="Total Receivables" value="$131,500" delta={15.0} trend="up" />
        <StatCard label="Total Payables" value="$197,000" delta={-2.1} trend="down" />
        <StatCard label="Collection Eff." value={`${sim?.efficiency}%`} delta={4.2} trend="up" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Cashflow Simulation Widget */}
        <div className="lg:col-span-4 space-y-6">
          <div className="bg-slate-900 text-white rounded-3xl p-8 shadow-2xl relative overflow-hidden group border border-slate-800">
             <div className="absolute top-0 right-0 p-6 opacity-10 group-hover:scale-110 transition-transform">
                <Wallet size={120} />
             </div>
             <div className="relative z-10 space-y-8">
                <div>
                   <h3 className="text-xs font-black uppercase tracking-[0.2em] text-emerald-400 mb-2">Liquidity Projection</h3>
                   <p className="text-4xl font-black">${sim?.projected.toLocaleString()}</p>
                   <p className="text-[10px] text-slate-400 uppercase font-bold mt-1">Projected balance at cycle end</p>
                </div>

                <div className="space-y-4 pt-4 border-t border-white/10">
                   <div className="flex justify-between items-center text-sm">
                      <span className="text-slate-400 flex items-center gap-2">
                        <ArrowUpRight size={14} className="text-emerald-500" />
                        Inflow (Collections)
                      </span>
                      <span className="font-bold text-emerald-400">+${sim?.collections.toLocaleString()}</span>
                   </div>
                   <div className="flex justify-between items-center text-sm">
                      <span className="text-slate-400 flex items-center gap-2">
                        <ArrowDownRight size={14} className="text-rose-500" />
                        Outflow (Vendor Payables)
                      </span>
                      <span className="font-bold text-rose-400">-${sim?.payables.toLocaleString()}</span>
                   </div>
                   <div className="flex justify-between items-center text-sm">
                      <span className="text-slate-400 flex items-center gap-2">
                        <ArrowDownRight size={14} className="text-rose-500" />
                        Outflow (Operating Exp)
                      </span>
                      <span className="font-bold text-rose-400">-${sim?.expenses.toLocaleString()}</span>
                   </div>
                </div>

                <div className="bg-white/5 rounded-2xl p-4 border border-white/10">
                   <div className="flex items-center gap-3">
                      <div className="bg-emerald-500/20 p-2 rounded-lg">
                        <Zap size={16} className="text-emerald-400" />
                      </div>
                      <div className="text-xs">
                         <p className="font-bold">Liquidity Runway</p>
                         <p className="text-slate-400">Strong: 4.2x debt coverage</p>
                      </div>
                   </div>
                </div>
             </div>
          </div>

          <div className="bg-card border border-border rounded-2xl p-6 shadow-sm">
             <h3 className="text-xs font-black uppercase tracking-widest text-primary mb-6 flex items-center gap-2">
               <Clock size={16} />
               Payables Aging Profile
             </h3>
             <div className="space-y-6">
                {apAging?.map((bucket: any, i: number) => (
                  <div key={i} className="space-y-2">
                    <div className="flex justify-between text-[11px] font-bold">
                       <span className="text-muted-foreground">{bucket.bucket}</span>
                       <span>${bucket.amount.toLocaleString()}</span>
                    </div>
                    <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
                       <div className="h-full" style={{ width: `${(bucket.amount / 200000) * 100}%`, backgroundColor: bucket.color }} />
                    </div>
                  </div>
                ))}
                <div className="pt-4 flex items-center gap-2 text-[10px] text-muted-foreground italic leading-relaxed border-t border-border">
                   <AlertCircle size={12} className="text-rose-500" />
                   Priority vendor "Shell Bulk" due for $32,000 settlement tomorrow.
                </div>
             </div>
          </div>
        </div>

        {/* AR Aging and Analysis */}
        <div className="lg:col-span-8 space-y-8">
           <div className="bg-card border border-border rounded-3xl p-8 shadow-sm">
              <div className="flex items-center justify-between mb-8">
                 <div>
                    <h3 className="text-xl font-bold tracking-tight">Accounts Receivable Aging</h3>
                    <p className="text-xs text-muted-foreground font-bold mt-1 uppercase tracking-wider">Bucket distribution of outstanding credit</p>
                 </div>
                 <div className="flex items-center gap-6">
                    {arAging?.map((b: any, i: number) => (
                      <div key={i} className="flex flex-col items-end">
                         <span className="text-[10px] font-black uppercase text-muted-foreground">{b.bucket}</span>
                         <span className="text-xs font-black" style={{ color: b.color }}>{b.percentage}%</span>
                      </div>
                    ))}
                 </div>
              </div>
              <div className="h-[250px]">
                 <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={arAging} barGap={0}>
                       <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                       <XAxis dataKey="bucket" axisLine={false} tickLine={false} tick={{fill: 'hsl(var(--muted-foreground))', fontSize: 10, fontWeight: 'bold'}} dy={10} />
                       <YAxis axisLine={false} tickLine={false} tick={{fill: 'hsl(var(--muted-foreground))', fontSize: 10}} />
                       <Tooltip cursor={{fill: 'hsl(var(--muted))', opacity: 0.4}} contentStyle={{ borderRadius: '12px', border: '1px solid hsl(var(--border))' }} />
                       <Bar dataKey="amount" radius={[6, 6, 0, 0]} barSize={60}>
                          {arAging?.map((entry: any, index: number) => (
                            <Cell key={`cell-${index}`} fill={entry.color} />
                          ))}
                       </Bar>
                    </BarChart>
                 </ResponsiveContainer>
              </div>
           </div>

           <div className="bg-card border border-border rounded-3xl overflow-hidden shadow-sm">
              <div className="p-6 border-b border-border bg-muted/10 flex items-center justify-between">
                 <h3 className="text-sm font-bold uppercase tracking-wider flex items-center gap-2">
                    <UserCheck size={18} className="text-primary" />
                    Top Credit Exposures (Active Debtors)
                 </h3>
                 <div className="relative">
                    <button type="button" onClick={() => setSortRecentFirst((v) => !v)} className="flex items-center gap-2 px-3 py-1 bg-white border border-border rounded-full text-[10px] font-bold hover:bg-muted transition-colors">
                       {sortRecentFirst ? 'Recent Invoices First' : 'Balance High First'}
                    </button>
                 </div>
              </div>
              {creditQuery.isLoading ? <TableSkeleton /> : (
                 <IFMSDataTable 
                   data={sortedDebtors}
                   onRowClick={(row) => setSelectedDebtor(row)}
                   columns={[
                     { header: 'Customer', accessorKey: 'name' },
                     { header: 'Outstanding ($)', accessorKey: 'balance', cell: (d: any) => d.balance.toLocaleString() },
                     { header: 'Credit Limit', accessorKey: 'limit', cell: (d: any) => d.limit.toLocaleString() },
                     { header: 'Utilization', accessorKey: 'utilization', cell: (d: any) => (
                        <div className="flex items-center gap-3">
                           <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
                              <div className={`h-full ${Number(d.utilization) > 90 ? 'bg-rose-500' : 'bg-primary'}`} style={{ width: `${d.utilization}%` }} />
                           </div>
                           <span className="text-[10px] font-bold">{d.utilization}%</span>
                        </div>
                     )},
                     { header: 'Last PMT', accessorKey: 'lastPayment' },
                     { header: 'Risk Status', accessorKey: 'status', cell: (d: any) => (
                        <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-tighter ${d.status === 'At Risk' ? 'bg-rose-500 text-white' : 'bg-emerald-100 text-emerald-700'}`}>
                           {d.status}
                        </span>
                     )}
                   ]}
                 />
              )}
           </div>
        </div>
      </div>

      {/* Debtor Statement & Contact Drawer */}
      <DetailsDrawer 
        isOpen={!!selectedDebtor} 
        onClose={() => setSelectedDebtor(null)}
        title="Account Intelligence Profile"
        subtitle={`Customer: ${selectedDebtor?.name} • ID: ${selectedDebtor?.id}`}
      >
        <div className="space-y-8">
           <div className="grid grid-cols-2 gap-4">
              <div className="p-4 bg-muted/30 border border-border rounded-2xl flex flex-col items-center justify-center text-center">
                 <p className="text-[10px] font-black uppercase text-muted-foreground mb-1">Current Balance</p>
                 <p className="text-xl font-black text-foreground">${selectedDebtor?.balance.toLocaleString()}</p>
              </div>
              <div className="p-4 bg-muted/30 border border-border rounded-2xl flex flex-col items-center justify-center text-center">
                 <p className="text-[10px] font-black uppercase text-muted-foreground mb-1">Days Past Due</p>
                 <p className="text-xl font-black text-rose-500">12 Days</p>
              </div>
           </div>

           <div className="space-y-4">
              <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-primary border-b border-border pb-2">Direct Contact</h4>
              <div className="grid grid-cols-1 gap-3">
                 <button type="button" onClick={() => { navigator.clipboard.writeText('+265881234567'); addToast('Phone number copied', 'success'); }} className="flex items-center gap-4 p-4 border border-border rounded-2xl hover:bg-muted/50 transition-all text-left group w-full">
                    <div className="p-2 bg-primary/10 text-primary rounded-xl group-hover:scale-110 transition-transform">
                       <Phone size={18} />
                    </div>
                    <div>
                       <p className="text-xs font-bold">+265 (0) 88 123 4567</p>
                       <p className="text-[10px] text-muted-foreground">Accounts Manager • Jane Phiri</p>
                    </div>
                 </button>
                 <button type="button" onClick={() => { navigator.clipboard.writeText('accounts@acme-logistics.com'); addToast('Email copied', 'success'); }} className="flex items-center gap-4 p-4 border border-border rounded-2xl hover:bg-muted/50 transition-all text-left group w-full">
                    <div className="p-2 bg-indigo-500/10 text-indigo-600 rounded-xl group-hover:scale-110 transition-transform">
                       <Mail size={18} />
                    </div>
                    <div>
                       <p className="text-xs font-bold">accounts@acme-logistics.com</p>
                       <p className="text-[10px] text-muted-foreground">Finance Portal (Auto-Sync)</p>
                    </div>
                 </button>
              </div>
           </div>

           <div className="space-y-4">
              <div className="flex items-center justify-between border-b border-border pb-2">
                 <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground">Statement Detail (Last 30d)</h4>
                 <button type="button" onClick={() => window.print()} className="text-[9px] font-black text-primary uppercase hover:underline">Full Statement</button>
              </div>
              {!selectedDebtor ? <div className="h-40 bg-muted animate-pulse rounded-2xl"></div> : (
                 <div className="space-y-3">
                    <div className="text-[10px] font-black uppercase text-muted-foreground/60 tracking-widest px-1">Open Invoices</div>
                    {(selectedDebtor?.invoices ?? []).map((inv: any, i: number) => (
                       <div key={i} className="flex justify-between items-center p-3 bg-muted/20 border border-border rounded-xl">
                          <div className="flex items-center gap-3">
                             <FileText size={14} className="text-muted-foreground" />
                             <div>
                                <p className="text-xs font-bold">{inv.id}</p>
                                <p className="text-[10px] text-muted-foreground">{inv.date}</p>
                             </div>
                          </div>
                          <div className="text-right">
                             <p className="text-xs font-black">${inv.amount.toLocaleString()}</p>
                             <p className={`text-[9px] font-black uppercase ${inv.status === 'Overdue' ? 'text-rose-500' : 'text-amber-500'}`}>{inv.status}</p>
                          </div>
                       </div>
                    ))}
                    <div className="h-px bg-border my-4" />
                    <div className="text-[10px] font-black uppercase text-muted-foreground/60 tracking-widest px-1">Recent Payments</div>
                    {(selectedDebtor?.payments ?? []).map((pmt: any, i: number) => (
                       <div key={i} className="flex justify-between items-center p-3 bg-emerald-500/5 border border-emerald-500/10 rounded-xl">
                          <div className="flex items-center gap-3">
                             <Briefcase size={14} className="text-emerald-600" />
                             <div>
                                <p className="text-xs font-bold">{pmt.id}</p>
                                <p className="text-[10px] text-muted-foreground">{pmt.date}</p>
                             </div>
                          </div>
                          <p className="text-xs font-black text-emerald-600">+${pmt.amount.toLocaleString()}</p>
                       </div>
                    ))}
                 </div>
              )}
           </div>

           <div className="pt-6 border-t border-border flex flex-col gap-3">
              <button
                type="button"
                onClick={async () => {
                  if (!selectedDebtor?.id) return;
                  try {
                    await customerActionMutation.mutateAsync({ customerId: selectedDebtor.id, action: 'send-payment-link' });
                    addToast('Payment link sent to customer email', 'success');
                  } catch (err: any) {
                    addToast(err?.apiError?.message ?? err?.message ?? 'Failed to send payment link', 'error');
                  }
                }}
                className="w-full py-4 bg-primary text-white font-black uppercase tracking-widest text-xs rounded-2xl shadow-xl shadow-primary/20 hover:opacity-90 transition-all"
              >
                Send Digital Payment Link
              </button>
              <button
                type="button"
                onClick={async () => {
                  if (!selectedDebtor?.id) return;
                  try {
                    await customerActionMutation.mutateAsync({ customerId: selectedDebtor.id, action: 'escalate-legal' });
                    addToast('Account flagged for legal collection review', 'info');
                  } catch (err: any) {
                    addToast(err?.apiError?.message ?? err?.message ?? 'Failed to flag for legal collection', 'error');
                  }
                }}
                className="w-full py-4 bg-rose-500/10 text-rose-600 font-black uppercase tracking-widest text-xs rounded-2xl hover:bg-rose-500/20 transition-all border border-rose-500/20"
              >
                Flag for Collection Legal
              </button>
           </div>
        </div>
      </DetailsDrawer>
    </div>
  );
};

export default CreditCashflowReport;
