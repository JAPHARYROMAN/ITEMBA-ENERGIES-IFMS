
import React, { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { apiReports } from '../../lib/api/reports';
import { postReportAction } from '../../lib/api/actions';
import PageHeader from '../ifms/PageHeader';
import ReportFilters from '../reports/ReportFilters';
import { IFMSDataTable } from '../ifms/DataTable';
import DetailsDrawer from '../ifms/DetailsDrawer';
import { useAppStore } from '../../store';
import { useReportsStore } from '../../store';
import { downloadCSV } from '../../lib/exportUtils';
import { 
  History, 
  Fuel, 
  Wallet, 
  Download, 
  AlertCircle, 
  CheckCircle2, 
  Clock,
  TrendingDown,
  TrendingUp
} from 'lucide-react';
import { TableSkeleton } from '../ifms/Skeletons';

type TabType = 'shifts' | 'pumps' | 'payments';

const DailyOperationsReport: React.FC = () => {
  const { addToast } = useAppStore();
  const { stationId, productId, dateRange } = useReportsStore();
  const [activeTab, setActiveTab] = useState<TabType>('shifts');
  const [selectedShift, setSelectedShift] = useState<any>(null);
  const reportActionMutation = useMutation({
    mutationFn: (payload: { action: 'approve-shift-audit' | 'flag-shift-audit'; targetId?: string }) =>
      postReportAction(payload.action, { targetId: payload.targetId }),
  });
  const filters = {
    dateFrom: dateRange.from,
    dateTo: dateRange.to,
    stationId: stationId ?? undefined,
    productId: productId ?? undefined,
  };
  const dailyQuery = useQuery({
    queryKey: ['report-daily-operations', filters],
    queryFn: () => apiReports.dailyOperations(filters) as Promise<any>,
  });
  const shifts = dailyQuery.data?.shifts ?? [];
  const pumps = dailyQuery.data?.pumps ?? [];
  const payments = dailyQuery.data?.payments ?? [];

  const tabs = [
    { id: 'shifts', label: 'Shifts & Reconciliation', icon: History },
    { id: 'pumps', label: 'Pumps & Nozzles', icon: Fuel },
    { id: 'payments', label: 'Payments Mix', icon: Wallet },
  ];

  const handleExport = () => {
    const date = new Date().toISOString().slice(0, 10);
    if (activeTab === 'shifts') {
      const data = shifts || [];
      downloadCSV(`daily-shifts-${date}.csv`, ['Shift ID', 'Cashier', 'Expected ($)', 'Actual ($)', 'Variance', 'Efficiency', 'Status'], data.map((s: any) => [s.id, s.cashierName, s.expectedSales, s.actualSales, s.variance, s.efficiency, s.status]));
    } else if (activeTab === 'pumps') {
      const data = pumps || [];
      downloadCSV(`daily-pumps-${date}.csv`, ['Pump ID', 'Nozzle', 'Product', 'Liters', 'Revenue', 'Uptime', 'Status'], data.map((p: any) => [p.id, p.nozzle, p.product, p.liters, p.revenue, p.uptime, p.status]));
    } else {
      const data = payments || [];
      const rows: (string | number)[][] = Object.entries(data as Record<string, number>).map(([method, amount]) => [method, amount]);
      downloadCSV(`daily-payments-${date}.csv`, ['Payment Method', 'Amount'], rows);
    }
    addToast('CSV exported', 'success');
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-12">
      <PageHeader 
        title="Daily Operations" 
        description="Granular audit and performance tracking across shifts and assets."
        actions={
          <button 
            onClick={handleExport}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-bold shadow-lg shadow-primary/20 hover:opacity-90"
          >
            <Download size={16} />
            Export CSV
          </button>
        }
      />

      <ReportFilters />

      {/* Navigation Tabs */}
      <div className="flex border-b border-border gap-8 overflow-x-auto no-scrollbar">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as TabType)}
            className={`flex items-center gap-2 px-2 py-4 text-sm font-bold transition-all border-b-2 relative ${
              activeTab === tab.id 
                ? 'border-primary text-primary' 
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <tab.icon size={16} />
            {tab.label}
          </button>
        ))}
      </div>

      <div className="min-h-[600px]">
        {activeTab === 'shifts' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-card p-4 rounded-xl border border-border shadow-sm">
                <p className="text-[10px] font-bold text-muted-foreground uppercase mb-1">Avg. Shift Variance</p>
                <div className="flex items-center gap-2">
                <span className="text-xl font-black text-rose-500">${dailyQuery.data?.stats?.avgShiftVariance?.toFixed?.(2) ?? '0.00'}</span>
                  <TrendingDown size={14} className="text-rose-500" />
                </div>
              </div>
              <div className="bg-card p-4 rounded-xl border border-border shadow-sm">
                <p className="text-[10px] font-bold text-muted-foreground uppercase mb-1">Audit Compliance</p>
                <div className="flex items-center gap-2">
                <span className="text-xl font-black text-emerald-500">{dailyQuery.data?.stats?.auditCompliancePct ?? 0}%</span>
                  <CheckCircle2 size={14} className="text-emerald-500" />
                </div>
              </div>
              <div className="bg-card p-4 rounded-xl border border-border shadow-sm">
                <p className="text-[10px] font-bold text-muted-foreground uppercase mb-1">Pending Closures</p>
                <div className="flex items-center gap-2">
                <span className="text-xl font-black">{dailyQuery.data?.stats?.pendingClosures ?? 0}</span>
                  <Clock size={14} className="text-amber-500" />
                </div>
              </div>
            </div>

            {dailyQuery.isLoading ? <TableSkeleton /> : (
              <IFMSDataTable 
                data={shifts}
                onRowClick={(row) => setSelectedShift(row)}
                columns={[
                  { header: 'Shift ID', accessorKey: 'id' },
                  { header: 'Cashier', accessorKey: 'cashierName' },
                  { header: 'Expected ($)', accessorKey: 'expectedSales', cell: (s: any) => s.expectedSales.toLocaleString(undefined, { minimumFractionDigits: 2 }) },
                  { header: 'Actual ($)', accessorKey: 'actualSales', cell: (s: any) => s.actualSales.toLocaleString(undefined, { minimumFractionDigits: 2 }) },
                  { header: 'Variance ($)', accessorKey: 'variance', cell: (s: any) => (
                    <span className={s.variance < 0 ? 'text-rose-600 font-bold' : 'text-emerald-600 font-bold'}>
                      {s.variance.toFixed(2)}
                    </span>
                  )},
                  { header: 'Efficiency', accessorKey: 'efficiency', cell: (s: any) => (
                    <div className="flex items-center gap-2">
                      <div className="w-12 h-1.5 bg-muted rounded-full overflow-hidden">
                        <div className="h-full bg-primary" style={{ width: `${s.efficiency}%` }} />
                      </div>
                      <span className="text-xs font-bold">{s.efficiency.toFixed(1)}%</span>
                    </div>
                  )},
                  { header: 'Status', accessorKey: 'status', cell: (s: any) => (
                    <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase ${s.status === 'open' ? 'bg-amber-100 text-amber-700 border border-amber-200' : 'bg-muted text-muted-foreground'}`}>
                      {s.status}
                    </span>
                  )}
                ]}
              />
            )}
          </div>
        )}

        {activeTab === 'pumps' && (
          <div className="space-y-6">
            <div className="bg-amber-500/10 border border-amber-200 p-4 rounded-xl flex items-center gap-3">
              <AlertCircle className="text-amber-600 flex-shrink-0" size={20} />
              <div className="text-sm">
                <span className="font-bold text-amber-800">Anomaly Detected:</span> Pump 02 / Nozzle 03 shows <span className="font-black">55% lower utilization</span> compared to station baseline. Possible hardware calibration issue.
              </div>
            </div>

            {dailyQuery.isLoading ? <TableSkeleton /> : (
              <IFMSDataTable 
                data={pumps}
                columns={[
                  { header: 'Pump ID', accessorKey: 'id' },
                  { header: 'Nozzle', accessorKey: 'nozzle' },
                  { header: 'Product', accessorKey: 'product' },
                  { header: 'Liters Sold', accessorKey: 'liters', cell: (p: any) => p.liters.toLocaleString() },
                  { header: 'Revenue ($)', accessorKey: 'revenue', cell: (p: any) => p.revenue.toLocaleString() },
                  { header: 'Uptime', accessorKey: 'uptime', cell: (p: any) => (
                    <span className={p.uptime < 90 ? 'text-rose-600 font-bold' : 'text-emerald-600 font-bold'}>
                      {p.uptime}%
                    </span>
                  )},
                  { header: 'Alert Level', accessorKey: 'status', cell: (p: any) => (
                    <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-tighter ${p.uptime < 90 ? 'bg-rose-500 text-white' : 'bg-muted text-muted-foreground'}`}>
                      {p.status}
                    </span>
                  )}
                ]}
              />
            )}
          </div>
        )}

        {activeTab === 'payments' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <div className="bg-card p-6 rounded-2xl border border-border shadow-sm">
              <h3 className="text-lg font-bold mb-6">Settlement Breakdown</h3>
              <div className="space-y-4">
                {payments?.map((p: any, i: number) => (
                  <div key={i} className="flex flex-col gap-2">
                    <div className="flex justify-between items-center text-sm font-bold">
                      <span>{p.name}</span>
                      <span>${p.value.toLocaleString()}</span>
                    </div>
                    <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                      <div className="h-full bg-primary" style={{ width: `${(p.value / 120000) * 100}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-muted/10 p-8 rounded-2xl border border-dashed border-border flex flex-col items-center justify-center text-center">
               <Wallet className="w-12 h-12 text-muted-foreground opacity-20 mb-4" />
               <h4 className="font-bold text-muted-foreground">Payment Reconciliation Notes</h4>
               <p className="text-xs text-muted-foreground/60 max-w-xs mt-2 italic">
                 "Credit card settlements from Highway Station were delayed by 4 hours due to gateway maintenance. All receipts verified."
               </p>
            </div>
          </div>
        )}
      </div>

      {/* Details Drawer for Shift */}
      <DetailsDrawer 
        isOpen={!!selectedShift} 
        onClose={() => setSelectedShift(null)}
        title="Shift Detail Analysis"
        subtitle={`Audit ID: ${selectedShift?.id || 'N/A'} • Cashier: ${selectedShift?.cashierName}`}
      >
        <div className="space-y-8">
          <div className="grid grid-cols-2 gap-4">
             <div className="bg-muted/30 p-4 rounded-lg border border-border">
                <p className="text-[10px] font-bold text-muted-foreground uppercase mb-1">Start Time</p>
                <p className="text-sm font-bold">{selectedShift && new Date(selectedShift.startTime).toLocaleString()}</p>
             </div>
             <div className="bg-muted/30 p-4 rounded-lg border border-border">
                <p className="text-[10px] font-bold text-muted-foreground uppercase mb-1">End Time</p>
                <p className="text-sm font-bold">{selectedShift?.endTime ? new Date(selectedShift.endTime).toLocaleString() : 'Active'}</p>
             </div>
          </div>

          <div className="space-y-4">
            <h4 className="text-xs font-bold uppercase tracking-widest text-primary border-b border-border pb-2">Financial Reconciliation</h4>
            <div className="space-y-3">
              <div className="flex justify-between items-center text-sm">
                <span className="text-muted-foreground">Expected Revenue</span>
                <span className="font-bold">${selectedShift?.expectedSales.toLocaleString()}</span>
              </div>
              <div className="flex justify-between items-center text-sm">
                <span className="text-muted-foreground">Actual Revenue</span>
                <span className="font-bold">${selectedShift?.actualSales.toLocaleString()}</span>
              </div>
              <div className="h-px bg-border my-2" />
              <div className="flex justify-between items-center text-lg font-black">
                <span>Variance</span>
                <span className={selectedShift?.variance < 0 ? 'text-rose-500' : 'text-emerald-500'}>
                  ${selectedShift?.variance.toFixed(2)}
                </span>
              </div>
            </div>
          </div>

          <div className="space-y-4">
             <h4 className="text-xs font-bold uppercase tracking-widest text-primary border-b border-border pb-2">Operational Notes</h4>
             <p className="text-xs text-muted-foreground leading-relaxed italic">
               Shift handed over successfully. No significant discrepancies reported in physical dips. High traffic observed during lunch hours.
             </p>
          </div>

          <div className="pt-6 flex gap-3">
             <button
               type="button"
               onClick={async () => {
                 try {
                   await reportActionMutation.mutateAsync({ action: 'approve-shift-audit', targetId: selectedShift?.id });
                   addToast('Shift audit approved and filed', 'success');
                 } catch (err: any) {
                   addToast(err?.apiError?.message ?? err?.message ?? 'Failed to approve shift audit', 'error');
                 }
               }}
               className="flex-1 py-3 bg-primary text-white font-bold rounded-xl shadow-lg shadow-primary/20 text-sm"
             >
               Approve & File Audit
             </button>
             <button
               type="button"
               onClick={async () => {
                 try {
                   await reportActionMutation.mutateAsync({ action: 'flag-shift-audit', targetId: selectedShift?.id });
                   addToast('Shift flagged for supervisor review', 'info');
                 } catch (err: any) {
                   addToast(err?.apiError?.message ?? err?.message ?? 'Failed to flag shift', 'error');
                 }
               }}
               className="px-4 py-3 bg-muted text-muted-foreground font-bold rounded-xl text-sm border border-border"
             >
               Flag for Review
             </button>
          </div>
        </div>
      </DetailsDrawer>
    </div>
  );
};

export default DailyOperationsReport;
