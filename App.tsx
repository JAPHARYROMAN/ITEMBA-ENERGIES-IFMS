
import React, { useEffect, useState, useMemo } from 'react';
import { HashRouter, Routes, Route, Navigate, useParams, useLocation, useNavigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Layout from './components/Layout';
import Dashboard from './components/Dashboard';
import ModulePlaceholder from './components/ModulePlaceholder';
import { GenericTablePage } from './components/pages/GenericTablePage';
import { TankForm } from './components/forms/TankForm';
import { ExpenseEntryForm } from './components/forms/ExpenseEntryForm';
import { PettyCashForm } from './components/forms/PettyCashForm';
import { CustomerManagement } from './components/forms/CustomerManagement';
import { CustomerForm } from './components/forms/CustomerForm';
import { CloseShiftForm } from './components/forms/CloseShiftForm';
import { OpenShiftForm } from './components/forms/OpenShiftForm';
import { NozzleSetupForm } from './components/forms/NozzleSetupForm';
import { CreateDeliveryForm } from './components/forms/CreateDeliveryForm';
import { CreditInvoiceForm } from './components/forms/CreditInvoiceForm';
import { RecordPaymentForm } from './components/forms/RecordPaymentForm';
import { GeneralSetupForm } from './components/forms/GeneralSetupForm';
import { ProductForm } from './components/forms/ProductForm';
import { ExpenseSummaryDrawer } from './components/expenses/ExpenseSummaryDrawer';
import POSPage from './components/pos/POSPage';
import ReportsOverview from './components/pages/ReportsOverview';
import DailyOperationsReport from './components/pages/DailyOperationsReport';
import StockLossReport from './components/pages/StockLossReport';
import ProfitabilityReport from './components/pages/ProfitabilityReport';
import CreditCashflowReport from './components/pages/CreditCashflowReport';
import StationComparisonReport from './components/pages/StationComparisonReport';
import GovernanceApprovalsPage from './components/pages/GovernanceApprovalsPage';
import GovernancePoliciesPage from './components/pages/GovernancePoliciesPage';
import { useAppStore, useAuthStore } from './store';
import {
  shiftRepo,
  saleRepo,
  deliveryRepo,
  customerRepo,
  expenseRepo,
  invoiceRepo,
  paymentRepo,
  pettyCashRepo,
} from './lib/repositories';
import { setupDataSource } from './lib/data-source';
import { ErrorBoundary } from './components/ErrorBoundary';
import { CommandMenu } from './components/ifms/CommandMenu';
import { ToastContainer } from './components/ifms/Toast';
import DetailsDrawer from './components/ifms/DetailsDrawer';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      retry: 1,
    },
  },
});

function TitleManager() {
  const location = useLocation();
  useEffect(() => {
    const path = location.pathname.split('/').pop() || 'Dashboard';
    const formatted = path.charAt(0).toUpperCase() + path.slice(1).replace(/-/g, ' ');
    document.title = `${formatted} | IFMS Suite`;
  }, [location]);
  return null;
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuthStore();
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function CustomerProfilePage() {
  const { id } = useParams();
  const navigate = useNavigate();
  return (
    <div className="fixed inset-0 z-[60] bg-background">
      <CustomerManagement 
        initialId={id} 
        onSuccess={() => navigate(-1)} 
        onCancel={() => navigate(-1)} 
      />
    </div>
  );
}

function ExpensesPage() {
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [reviewItem, setReviewItem] = useState<any>(null);

  const columns = useMemo(() => [
    { header: 'ID', accessorKey: 'id' },
    { header: 'Date', accessorKey: 'timestamp', cell: (e: any) => new Date(e.timestamp).toLocaleDateString() },
    { header: 'Vendor', accessorKey: 'vendor' },
    { header: 'Category', accessorKey: 'category' },
    { header: 'Amount ($)', accessorKey: 'amount', cell: (e: any) => e.amount.toLocaleString() },
    { header: 'Status', accessorKey: 'status', cell: (e: any) => (
      <div className="flex flex-col items-start gap-1">
        <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase ${
          e.status === 'Approved' ? 'bg-emerald-100 text-emerald-800' :
          e.status === 'Rejected' ? 'bg-rose-100 text-rose-800' : 'bg-amber-100 text-amber-800'
        }`}>{e.status}</span>
        {String(e.governanceApprovalStatus ?? '').toLowerCase() === 'submitted' && (
          <a
            href="#/app/governance/approvals"
            className="px-2 py-0.5 rounded text-[9px] font-black uppercase bg-blue-100 text-blue-800 hover:underline"
          >
            Pending Governance
          </a>
        )}
      </div>
    )},
  ], []);

  return (
    <>
      <GenericTablePage
        title="Expense Control Center"
        description="Global expenditure audit and authorization workflow."
        queryKey={['expenses']}
        queryFn={expenseRepo.list}
        entityName="Expense"
        FormComponent={ExpenseEntryForm}
        columns={columns}
        onRowClick={(e: any) => setReviewItem(e)}
      />
      <div className="mt-4 flex justify-end">
         <button onClick={() => setSummaryOpen(true)} className="flex items-center gap-2 px-4 py-2 bg-card border border-border rounded-xl text-xs font-black uppercase tracking-widest text-primary hover:bg-muted transition-all">
            View Analytics
         </button>
      </div>

      <DetailsDrawer isOpen={summaryOpen} onClose={() => setSummaryOpen(false)} title="Intelligence" subtitle="Fiscal analytics">
        <ExpenseSummaryDrawer />
      </DetailsDrawer>

      <DetailsDrawer isOpen={!!reviewItem} onClose={() => setReviewItem(null)} title="Verification" subtitle="Audit details">
        {reviewItem && <ExpenseEntryForm initialData={reviewItem} onSuccess={() => setReviewItem(null)} onCancel={() => setReviewItem(null)} />}
      </DetailsDrawer>
    </>
  );
}

function LoginPage() {
  const { loginWithCredentials } = useAuthStore();
  const navigate = useNavigate();
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState('');
  const { addToast } = useAppStore();

  const handleCredentialsSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await loginWithCredentials?.(email, password);
      navigate('/app/dashboard');
    } catch (err: any) {
      const msg = err?.apiError?.message ?? err?.message ?? 'Login failed';
      setError(msg);
      addToast(msg, 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
      <div className="p-10 bg-card rounded-[2.5rem] shadow-2xl w-full max-w-md border border-border text-center">
        <div className="inline-flex items-center justify-center w-20 h-20 bg-indigo-600 rounded-[2rem] mb-6 text-white">
          <span className="text-3xl font-black">IF</span>
        </div>
        <h1 className="text-3xl font-black tracking-tighter">Enterprise Suite</h1>
        <form onSubmit={handleCredentialsSubmit} className="mt-8 space-y-4 text-left">
          <div>
            <label className="block text-xs font-black uppercase tracking-widest text-muted-foreground mb-1.5">Email</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required className="w-full px-4 py-2.5 rounded-xl border border-border bg-background text-sm" placeholder="admin@ifms.com" />
          </div>
          <div>
            <label className="block text-xs font-black uppercase tracking-widest text-muted-foreground mb-1.5">Password</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} className="w-full px-4 py-2.5 rounded-xl border border-border bg-background text-sm" placeholder="••••••••" />
          </div>
          {error && <p className="text-xs text-rose-600 font-medium">{error}</p>}
          <button type="submit" disabled={loading} className="w-full bg-primary text-primary-foreground font-black uppercase tracking-widest text-xs py-4 rounded-[1.25rem] disabled:opacity-50">
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  );
}

function AppContent() {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuthStore();

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/app" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
        <Route index element={<Navigate to="/app/dashboard" replace />} />
        <Route path="dashboard" element={<Dashboard />} />
        <Route path="setup/*">
          <Route path="companies" element={<GenericTablePage title="Entities" description="Manage organizations." queryKey={['companies']} queryFn={setupDataSource.companies.list} entityName="Company" FormComponent={(props) => <GeneralSetupForm {...props} entityName="Company" />} columns={[{ header: 'Code', accessorKey: 'code' }, { header: 'Name', accessorKey: 'name' }]} />} />
          <Route path="stations" element={<GenericTablePage title="Stations" description="Manage station nodes." queryKey={['stations']} queryFn={setupDataSource.stations.list} entityName="Station" FormComponent={(props) => <GeneralSetupForm {...props} entityName="Station" />} columns={[{ header: 'ID', accessorKey: 'id' }, { header: 'Name', accessorKey: 'name' }]} />} />
          <Route path="branches" element={<GenericTablePage title="Branches" description="Granular branch management." queryKey={['branches']} queryFn={() => setupDataSource.branches.list()} entityName="Branch" FormComponent={(props) => <GeneralSetupForm {...props} entityName="Branch" />} columns={[{ header: 'ID', accessorKey: 'id' }, { header: 'Name', accessorKey: 'name' }]} />} />
          <Route path="products" element={<GenericTablePage title="Products" description="Product catalog." queryKey={['products']} queryFn={setupDataSource.products.list} entityName="Product" FormComponent={ProductForm} columns={[{ header: 'Code', accessorKey: 'code' }, { header: 'Name', accessorKey: 'name' }, { header: 'Price', accessorKey: 'pricePerUnit' }]} />} />
          <Route path="tanks" element={<GenericTablePage title="Tanks" description="Fuel tank monitoring." queryKey={['tanks']} queryFn={() => setupDataSource.tanks.list()} entityName="Tank" FormComponent={TankForm} columns={[{ header: 'Code', accessorKey: 'code' }, { header: 'Capacity', accessorKey: 'capacity' }]} />} />
          <Route path="pumps-nozzles" element={<GenericTablePage title="Hardware" description="Hardware mapping." queryKey={['nozzles']} queryFn={setupDataSource.nozzles.list} entityName="Nozzle" FormComponent={NozzleSetupForm} columns={[{ header: 'Pump', accessorKey: 'pumpCode' }, { header: 'Nozzle', accessorKey: 'nozzleCode' }]} />} />
        </Route>
        <Route path="shifts/*">
          <Route path="open" element={<div className="max-w-4xl mx-auto pt-6"><OpenShiftForm onSuccess={() => navigate(-1)} onCancel={() => navigate(-1)} /></div>} />
          <Route path="close" element={<div className="max-w-4xl mx-auto pt-6"><CloseShiftForm onSuccess={() => navigate(-1)} onCancel={() => navigate(-1)} /></div>} />
          <Route path="history" element={<GenericTablePage title="Shift Journal" description="Archive of activity." queryKey={['shifts']} queryFn={shiftRepo.list} columns={[{ header: 'ID', accessorKey: 'id' }, { header: 'Status', accessorKey: 'status' }]} />} />
        </Route>
        <Route path="sales/*">
          <Route path="pos" element={<POSPage />} />
          <Route path="receipts" element={<GenericTablePage title="Electronic Journal" description="Point-of-sale events." queryKey={['sales']} queryFn={saleRepo.list} columns={[{ header: 'ID', accessorKey: 'id' }, { header: 'Total', accessorKey: 'totalAmount' }]} />} />
        </Route>
        <Route path="deliveries/*">
          <Route path="create" element={<div className="max-w-4xl mx-auto pt-6"><CreateDeliveryForm onSuccess={() => navigate(-1)} onCancel={() => navigate(-1)} /></div>} />
          <Route path="grn" element={<GenericTablePage title="GRN Portal" description="Replenishment audit." queryKey={['del-pending']} queryFn={deliveryRepo.list} columns={[{ header: 'ID', accessorKey: 'id' }, { header: 'Status', accessorKey: 'status' }]} onRowClick={(d) => navigate('/app/deliveries/grn/' + d.id)} />} />
        </Route>
        <Route path="credit/*">
          <Route path="customers/:id" element={<CustomerProfilePage />} />
          <Route path="customers" element={<GenericTablePage title="Accounts" description="Corporate accounts." queryKey={['customers']} queryFn={customerRepo.list} entityName="Customer" FormComponent={CustomerForm} columns={[{ header: 'Name', accessorKey: 'name' }, { header: 'Balance', accessorKey: 'balance' }]} onRowClick={(c) => navigate('/app/credit/customers/' + c.id)} />} />
          <Route path="invoices" element={<GenericTablePage title="Invoices" description="Manage invoices." queryKey={['invoices']} queryFn={invoiceRepo.list} entityName="Invoice" FormComponent={CreditInvoiceForm} columns={[{ header: 'Inv #', accessorKey: 'id' }, { header: 'Balance', accessorKey: 'balanceRemaining' }]} />} />
          <Route path="statements" element={<GenericTablePage title="Receivables" description="Ledger entries." queryKey={['payments']} queryFn={paymentRepo.list} entityName="Payment" FormComponent={RecordPaymentForm} columns={[{ header: 'Ref #', accessorKey: 'id' }, { header: 'Amount', accessorKey: 'amount' }]} />} />
        </Route>
        <Route path="expenses/*">
          <Route path="entries" element={<ExpensesPage />} />
          <Route path="petty-cash" element={<GenericTablePage title="Petty Cash" description="Liquid fund audit." queryKey={['petty-cash-transactions']} queryFn={pettyCashRepo.list} entityName="Transaction" FormComponent={PettyCashForm} columns={[{ header: 'ID', accessorKey: 'id' }, { header: 'Type', accessorKey: 'type' }, { header: 'Amount', accessorKey: 'amount' }]} />} />
        </Route>
        <Route path="reports/*">
          <Route path="overview" element={<ReportsOverview />} />
          <Route path="daily-operations" element={<DailyOperationsReport />} />
          <Route path="stock-loss" element={<StockLossReport />} />
          <Route path="profitability" element={<ProfitabilityReport />} />
          <Route path="credit-cashflow" element={<CreditCashflowReport />} />
          <Route path="station-comparison" element={<StationComparisonReport />} />
        </Route>
        <Route path="governance/*">
          <Route path="approvals" element={<GovernanceApprovalsPage />} />
          <Route path="policies" element={<GovernancePoliciesPage />} />
        </Route>
        <Route path="*" element={<ModulePlaceholder />} />
      </Route>
      <Route path="/" element={<Navigate to={isAuthenticated ? "/app/dashboard" : "/login"} replace />} />
    </Routes>
  );
}

export default function App() {
  const { theme } = useAppStore();
  const logout = useAuthStore((s) => s.logout);

  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [theme]);

  useEffect(() => {
    const onLogout = () => logout();
    window.addEventListener('ifms:auth-logout', onLogout);
    return () => window.removeEventListener('ifms:auth-logout', onLogout);
  }, [logout]);

  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <HashRouter>
          <TitleManager />
          <CommandMenu />
          <ToastContainer />
          <AppContent />
        </HashRouter>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
