
import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import PageHeader from './ifms/PageHeader';
import { Lock, Database, Plus } from 'lucide-react';
import { useAuthStore, useAppStore } from '../store';
import { stationRepo, customerRepo, saleRepo } from '../lib/repositories';
import { TableSkeleton } from './ifms/Skeletons';

const PLACEHOLDER_NEW_ROUTES: Record<string, string> = {
  'transactions': '/app/sales/pos',
  'receipts': '/app/sales/receipts',
  'dips': '/app/deliveries/create',
  'reconciliation': '/app/deliveries/grn',
  'variance': '/app/reports/stock-loss',
  'create delivery': '/app/deliveries/create',
  'grn': '/app/deliveries/grn',
  'history': '/app/deliveries/grn',
  'tank to tank': '/app/setup/tanks',
  'station to station': '/app/setup/stations',
  'adjustments': '/app/setup/tanks',
  'aging': '/app/credit/customers',
  'suppliers': '/app/setup/companies',
  'invoices': '/app/credit/invoices',
  'customers': '/app/credit/customers',
  'entries': '/app/expenses/entries',
  'petty cash': '/app/expenses/petty-cash',
  'categories': '/app/expenses/entries',
  'companies': '/app/setup/companies',
  'stations': '/app/setup/stations',
  'branches': '/app/setup/branches',
  'tanks': '/app/setup/tanks',
  'pumps nozzles': '/app/setup/pumps-nozzles',
  'products': '/app/setup/companies',
  'users roles': '/app/setup/companies',
};

const ModulePlaceholder: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const { addToast } = useAppStore();
  
  const pathParts = location.pathname.split('/').filter(Boolean);
  const moduleName = pathParts[pathParts.length - 1]?.replace(/-/g, ' ') || 'Module';
  const parentName = pathParts[pathParts.length - 2]?.replace(/-/g, ' ') || '';

  const isReadOnly = user?.role === 'auditor';

  const stationsQuery = useQuery({ queryKey: ['stations'], queryFn: stationRepo.list });
  const customersQuery = useQuery({ queryKey: ['customers'], queryFn: customerRepo.list });
  const salesQuery = useQuery({ queryKey: ['sales'], queryFn: saleRepo.list });

  const isLoading = stationsQuery.isLoading || customersQuery.isLoading || salesQuery.isLoading;

  const handleNewEntry = () => {
    const key = moduleName.toLowerCase();
    const target = PLACEHOLDER_NEW_ROUTES[key] || (pathParts.length >= 2 ? `/app/${pathParts[pathParts.length - 2]}` : '/app/dashboard');
    addToast(`Taking you to ${moduleName}...`, 'info');
    navigate(target);
  };

  return (
    <div className="animate-in fade-in slide-in-from-bottom-2 duration-500">
      <PageHeader 
        title={moduleName.charAt(0).toUpperCase() + moduleName.slice(1)} 
        description={`${parentName ? parentName.toUpperCase() + ' > ' : ''}Management and analysis for IFMS ${moduleName}.`}
        actions={
          !isReadOnly && (
            <button 
              onClick={handleNewEntry}
              className="px-6 py-2.5 bg-primary text-primary-foreground rounded-xl text-xs font-black uppercase tracking-widest shadow-lg shadow-primary/20 hover:opacity-90 transition-all flex items-center gap-2"
            >
              <Plus size={14} /> New {moduleName}
            </button>
          )
        }
      />

      {isLoading ? (
        <div className="bg-card border border-border rounded-xl p-8">
           <TableSkeleton />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6">
          <div className="bg-card border border-border rounded-[2rem] p-12 flex flex-col items-center justify-center text-center shadow-sm">
            <div className="w-20 h-20 bg-muted rounded-[1.5rem] flex items-center justify-center mb-6 text-primary/40 border border-border">
              <Database size={32} />
            </div>
            <h2 className="text-2xl font-black tracking-tight mb-2">Enterprise Node Connected</h2>
            <p className="text-muted-foreground max-w-md text-sm font-medium">
              The <strong>{moduleName}</strong> interface is successfully synchronized with the core data layer.
              Currently indexing <strong>{parentName || 'global'}</strong> records.
            </p>

            <div className="mt-10 grid grid-cols-1 sm:grid-cols-3 gap-6 w-full max-w-3xl">
              <div className="bg-muted/30 p-6 rounded-[1.25rem] border border-border group hover:border-primary/30 transition-all">
                 <p className="text-[10px] font-black text-muted-foreground uppercase mb-2 tracking-widest">Active Stations</p>
                 <p className="text-3xl font-black group-hover:text-primary transition-colors">{stationsQuery.data?.length || 0}</p>
              </div>
              <div className="bg-muted/30 p-6 rounded-[1.25rem] border border-border group hover:border-primary/30 transition-all">
                 <p className="text-[10px] font-black text-muted-foreground uppercase mb-2 tracking-widest">Master Accounts</p>
                 <p className="text-3xl font-black group-hover:text-primary transition-colors">{customersQuery.data?.length || 0}</p>
              </div>
              <div className="bg-muted/30 p-6 rounded-[1.25rem] border border-border group hover:border-primary/30 transition-all">
                 <p className="text-[10px] font-black text-muted-foreground uppercase mb-2 tracking-widest">Recent Sales</p>
                 <p className="text-3xl font-black group-hover:text-primary transition-colors">{salesQuery.data?.length || 0}</p>
              </div>
            </div>

            <div className="mt-12 p-4 border border-dashed border-border rounded-2xl w-full max-w-2xl bg-muted/10">
               <p className="text-[10px] font-black uppercase text-muted-foreground tracking-widest flex items-center justify-center gap-2">
                  <Lock size={12} className="text-primary/60" />
                  {isReadOnly ? "Audit constraints applied. Modification tools are disabled." : "Full modification rights enabled for this session."}
               </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ModulePlaceholder;
