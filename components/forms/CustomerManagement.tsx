
import React, { useState } from 'react';
import { useForm, FormProvider } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { CustomerSchema, Customer, Invoice, CustomerPayment } from '../../lib/models';
import { FormSection, FormSubmitState, PermissionGuard } from '../ifms/forms/Primitives';
import { TextField, NumberField, SelectField, TextareaField } from '../ifms/forms/Fields';
import { customerRepo, invoiceRepo, paymentRepo } from '../../lib/repositories';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { IFMSDataTable } from '../ifms/DataTable';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../ui/Tabs';
import DetailsDrawer from '../ifms/DetailsDrawer';
import { CreditInvoiceForm } from './CreditInvoiceForm';
import { RecordPaymentForm } from './RecordPaymentForm';
import { triggerPrint } from '../../lib/exportUtils';
import { FileText, CreditCard, History, StickyNote, User, Building2 } from 'lucide-react';
import { useAppStore } from '../../store';
import { addCustomerNote } from '../../lib/api/actions';

export const CustomerManagement: React.FC<{ initialId?: string; onSuccess: () => void; onCancel: () => void }> = ({ initialId, onSuccess, onCancel }) => {
  const queryClient = useQueryClient();
  const { addToast } = useAppStore();
  const [activeTab, setActiveTab] = useState('profile');
  const [showInvoiceDrawer, setShowInvoiceDrawer] = useState(false);
  const [showPaymentDrawer, setShowPaymentDrawer] = useState(false);
  const [editingNoteId, setEditingNoteId] = useState<number | null>(null);
  const [noteContent, setNoteContent] = useState('Customer requested extension for Invoice INV-1002 due to regional liquidity crunch. Approved by Alex Manager for 15 days extra.');
  const [showNewNote, setShowNewNote] = useState(false);
  const [newNoteText, setNewNoteText] = useState('');

  const handleInvoiceSuccess = () => {
    setShowInvoiceDrawer(false);
    queryClient.invalidateQueries({ queryKey: ['customer-invoices', initialId] });
    queryClient.invalidateQueries({ queryKey: ['customer', initialId] });
    addToast('Invoice created', 'success');
  };

  const handlePaymentSuccess = () => {
    setShowPaymentDrawer(false);
    queryClient.invalidateQueries({ queryKey: ['customer-payments', initialId] });
    queryClient.invalidateQueries({ queryKey: ['customer', initialId] });
    addToast('Payment recorded', 'success');
  };

  const { data: customer, isLoading: isLoadingCustomer } = useQuery({
    queryKey: ['customer', initialId],
    queryFn: () => customerRepo.get(initialId!),
    enabled: !!initialId
  });

  const { data: invoices } = useQuery({
    queryKey: ['customer-invoices', initialId],
    queryFn: () => invoiceRepo.list(initialId!),
    enabled: !!initialId
  });

  const { data: payments } = useQuery({
    queryKey: ['customer-payments', initialId],
    queryFn: () => paymentRepo.list(initialId!),
    enabled: !!initialId
  });

  const methods = useForm<Customer>({
    resolver: zodResolver(CustomerSchema),
    defaultValues: customer || { status: 'Active', paymentTerms: 'Net 30', creditLimit: 0, balance: 0 }
  });

  React.useEffect(() => {
    if (customer) methods.reset(customer);
  }, [customer, methods]);

  const mutation = useMutation({
    mutationFn: (data: Customer) => customerRepo.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      addToast("Customer record updated", "success");
      onSuccess();
    }
  });

  const noteMutation = useMutation({
    mutationFn: async (note: string) => {
      if (!initialId) throw new Error('Customer ID is required');
      return addCustomerNote(initialId, note);
    },
  });

  if (initialId && isLoadingCustomer) return <div className="p-12 text-center animate-pulse font-black uppercase">Retrieving Master Record...</div>;

  return (
    <div className="flex flex-col lg:flex-row h-full">
      {/* LEFT: MASTER FORM */}
      <div className="w-full lg:w-1/3 border-r border-border bg-card overflow-y-auto no-scrollbar">
        <FormProvider {...methods}>
          <form onSubmit={methods.handleSubmit((d) => mutation.mutate(d))} className="p-8 space-y-10">
            <div className="flex items-center gap-4 mb-6">
              <div className="w-12 h-12 rounded-2xl bg-primary/10 text-primary flex items-center justify-center">
                <User size={24} />
              </div>
              <div>
                <h3 className="text-lg font-black tracking-tight">{initialId ? 'Update Identity' : 'Register Customer'}</h3>
                <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-widest">Master Data Governance</p>
              </div>
            </div>

            <FormSection title="Entity Details">
              <TextField name="name" label="Legal Name" required fullWidth />
              <TextField name="taxId" label="TIN / VRN" placeholder="Optional" />
              <TextField name="phone" label="Primary Phone" />
              <TextField name="email" label="Billing Email" fullWidth />
              <TextareaField name="address" label="Registered Address" fullWidth />
            </FormSection>

            <FormSection title="Financial Controls">
              <NumberField name="creditLimit" label="Credit Ceiling ($)" required />
              <SelectField 
                name="paymentTerms" 
                label="Agreed Terms" 
                options={[
                  { label: 'C.O.D (Cash on Delivery)', value: 'C.O.D' },
                  { label: 'Net 7 Days', value: 'Net 7' },
                  { label: 'Net 15 Days', value: 'Net 15' },
                  { label: 'Net 30 Days', value: 'Net 30' },
                ]} 
                required 
              />
              <SelectField 
                name="status" 
                label="Account State" 
                options={[
                  { label: 'Active - Transacting', value: 'Active' },
                  { label: 'Suspended - Blocked', value: 'Suspended' },
                  { label: 'Closed - Inactive', value: 'Closed' },
                ]} 
                required 
              />
            </FormSection>

            <PermissionGuard>
              <div className="flex gap-3 pt-6 border-t border-border">
                <button type="submit" className="flex-1 py-3 bg-primary text-primary-foreground rounded-xl text-xs font-black uppercase tracking-widest shadow-xl shadow-primary/20">
                  <FormSubmitState loading={mutation.isPending} label="Commit Profile" />
                </button>
                <button type="button" onClick={onCancel} className="px-5 py-3 text-[10px] font-black uppercase text-muted-foreground hover:bg-muted rounded-xl transition-all">Cancel</button>
              </div>
            </PermissionGuard>
          </form>
        </FormProvider>
      </div>

      {/* RIGHT: TABBED DETAIL AREA */}
      <div className="flex-1 bg-slate-50 dark:bg-slate-950 overflow-hidden flex flex-col">
        {!initialId ? (
          <div className="flex-1 flex flex-col items-center justify-center opacity-30 text-center p-12">
            <Building2 size={64} className="mb-4" />
            <h4 className="text-xl font-black uppercase tracking-tight">Persistence Required</h4>
            <p className="max-w-xs text-sm font-bold">Save the master profile to enable ledger views and transaction history.</p>
          </div>
        ) : (
          <div className="flex-1 flex flex-col h-full">
            <div className="px-8 pt-8 bg-card border-b border-border">
               <div className="flex items-center justify-between mb-6">
                 <div className="flex items-center gap-6">
                    <div className="bg-muted px-4 py-2 rounded-xl border border-border">
                       <p className="text-[9px] font-black uppercase text-muted-foreground mb-1">Exposure</p>
                       <p className="text-lg font-black">${customer?.balance.toLocaleString()}</p>
                    </div>
                    <div className="bg-muted px-4 py-2 rounded-xl border border-border">
                       <p className="text-[9px] font-black uppercase text-muted-foreground mb-1">Utilization</p>
                       <p className="text-lg font-black">{((customer?.balance || 0) / (customer?.creditLimit || 1) * 100).toFixed(1)}%</p>
                    </div>
                 </div>
                 <div className="flex gap-2">
                    <button type="button" onClick={() => setShowInvoiceDrawer(true)} className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-[10px] font-black uppercase tracking-widest hover:opacity-90 transition-opacity">New Invoice</button>
                    <button type="button" onClick={() => setShowPaymentDrawer(true)} className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-[10px] font-black uppercase tracking-widest hover:opacity-90 transition-opacity">Post Payment</button>
                 </div>
               </div>

               <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                <TabsList className="bg-transparent border-b-0 gap-8 h-auto p-0">
                  <TabsTrigger value="profile" className="data-[state=active]:border-primary border-b-2 border-transparent rounded-none px-1 pb-4 h-auto bg-transparent shadow-none font-black uppercase text-[10px] tracking-widest text-muted-foreground data-[state=active]:text-primary">
                    <History size={14} className="mr-2" /> Statements
                  </TabsTrigger>
                  <TabsTrigger value="invoices" className="data-[state=active]:border-primary border-b-2 border-transparent rounded-none px-1 pb-4 h-auto bg-transparent shadow-none font-black uppercase text-[10px] tracking-widest text-muted-foreground data-[state=active]:text-primary">
                    <FileText size={14} className="mr-2" /> Invoices
                  </TabsTrigger>
                  <TabsTrigger value="payments" className="data-[state=active]:border-primary border-b-2 border-transparent rounded-none px-1 pb-4 h-auto bg-transparent shadow-none font-black uppercase text-[10px] tracking-widest text-muted-foreground data-[state=active]:text-primary">
                    <CreditCard size={14} className="mr-2" /> Payments
                  </TabsTrigger>
                  <TabsTrigger value="notes" className="data-[state=active]:border-primary border-b-2 border-transparent rounded-none px-1 pb-4 h-auto bg-transparent shadow-none font-black uppercase text-[10px] tracking-widest text-muted-foreground data-[state=active]:text-primary">
                    <StickyNote size={14} className="mr-2" /> Audit Notes
                  </TabsTrigger>
                </TabsList>
              </Tabs>
            </div>

            <div className="flex-1 overflow-y-auto p-8">
              <Tabs value={activeTab} className="h-full">
                <TabsContent value="profile" className="mt-0 h-full">
                  <div className="bg-card border border-border rounded-3xl p-8 shadow-sm">
                    <h4 className="text-sm font-black uppercase tracking-[0.2em] text-primary mb-6">Financial Statement Audit</h4>
                    <div className="space-y-4">
                      {/* Statement list */}
                      {[1, 2, 3].map(i => (
                        <div key={i} className="flex items-center justify-between p-4 bg-muted/20 border border-border rounded-2xl hover:bg-muted/40 transition-all cursor-pointer">
                          <div className="flex items-center gap-4">
                             <div className="p-2 bg-white rounded-xl shadow-sm"><FileText size={18} className="text-muted-foreground" /></div>
                             <div>
                                <p className="text-sm font-bold uppercase">Statement Oct 2024</p>
                                <p className="text-[10px] text-muted-foreground">Generated on 31 Oct • Cycle Completed</p>
                             </div>
                          </div>
                          <button type="button" onClick={() => triggerPrint()} className="text-[10px] font-black uppercase text-primary hover:underline">Download PDF</button>
                        </div>
                      ))}
                    </div>
                  </div>
                </TabsContent>
                
                <TabsContent value="invoices" className="mt-0">
                  <IFMSDataTable 
                    data={invoices || []}
                    columns={[
                      { header: 'Reference', accessorKey: 'id' },
                      { header: 'Date', accessorKey: 'date' },
                      // Fix: Casting to Invoice to resolve generic type inference issues
                      { header: 'Amount', accessorKey: 'totalAmount', cell: (i: any) => `$${(i as Invoice).totalAmount.toLocaleString()}` },
                      { header: 'Balance', accessorKey: 'balanceRemaining', cell: (i: any) => (
                        <span className={`font-black ${(i as Invoice).balanceRemaining > 0 ? 'text-rose-500' : 'text-emerald-500'}`}>
                          ${(i as Invoice).balanceRemaining.toLocaleString()}
                        </span>
                      )},
                      { header: 'Status', accessorKey: 'status', cell: (i: any) => (
                        <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase ${(i as Invoice).status === 'Paid' ? 'bg-emerald-100 text-emerald-800' : (i as Invoice).status === 'Partial' ? 'bg-amber-100 text-amber-800' : 'bg-rose-100 text-rose-800'}`}>
                          {(i as Invoice).status}
                        </span>
                      )}
                    ]}
                  />
                </TabsContent>

                <TabsContent value="payments" className="mt-0">
                  <IFMSDataTable 
                    data={payments || []}
                    columns={[
                      { header: 'ID', accessorKey: 'id' },
                      { header: 'Date', accessorKey: 'date' },
                      { header: 'Method', accessorKey: 'method' },
                      // Fix: Casting to CustomerPayment to resolve generic type inference issues
                      { header: 'Amount', accessorKey: 'amount', cell: (p: any) => `$${(p as CustomerPayment).amount.toLocaleString()}` },
                      { header: 'Ref', accessorKey: 'referenceNo' }
                    ]}
                  />
                </TabsContent>

                <TabsContent value="notes" className="mt-0">
                   <div className="space-y-6">
                      <div className="p-6 bg-muted/20 border border-dashed border-border rounded-2xl">
                         {editingNoteId === 0 ? (
                           <>
                             <textarea value={noteContent} onChange={(e) => setNoteContent(e.target.value)} className="w-full min-h-[80px] p-3 text-xs bg-background border border-border rounded-xl mb-4" placeholder="Note content..." />
                             <div className="flex justify-end gap-2">
                               <button type="button" onClick={() => setEditingNoteId(null)} className="text-[9px] font-black uppercase text-muted-foreground">Cancel</button>
                               <button
                                 type="button"
                                 onClick={async () => {
                                   try {
                                     await noteMutation.mutateAsync(noteContent);
                                     addToast('Note updated', 'success');
                                     setEditingNoteId(null);
                                   } catch (err: any) {
                                     addToast(err?.apiError?.message ?? err?.message ?? 'Failed to save note', 'error');
                                   }
                                 }}
                                 className="text-[9px] font-black uppercase text-primary"
                               >
                                 Save
                               </button>
                             </div>
                           </>
                         ) : (
                           <>
                             <p className="text-xs text-muted-foreground italic mb-4">"{noteContent}"</p>
                             <div className="flex items-center justify-between">
                               <span className="text-[9px] font-black uppercase text-muted-foreground/60">24 Oct 2024 • Admin Audit</span>
                               <button type="button" onClick={() => setEditingNoteId(0)} className="text-[9px] font-black text-primary uppercase hover:underline">Edit Note</button>
                             </div>
                           </>
                         )}
                      </div>
                      {showNewNote ? (
                        <div className="p-6 border border-border rounded-2xl bg-card space-y-4">
                          <textarea value={newNoteText} onChange={(e) => setNewNoteText(e.target.value)} className="w-full min-h-[80px] p-3 text-xs bg-background border border-border rounded-xl" placeholder="New internal note..." />
                          <div className="flex gap-2">
                            <button type="button" onClick={() => { setNewNoteText(''); setShowNewNote(false); }} className="px-4 py-2 text-[10px] font-black uppercase text-muted-foreground hover:bg-muted rounded-xl">Cancel</button>
                            <button
                              type="button"
                              onClick={async () => {
                                try {
                                  await noteMutation.mutateAsync(newNoteText);
                                  addToast('Internal note added', 'success');
                                  setNewNoteText('');
                                  setShowNewNote(false);
                                } catch (err: any) {
                                  addToast(err?.apiError?.message ?? err?.message ?? 'Failed to add note', 'error');
                                }
                              }}
                              className="px-4 py-2 bg-primary text-primary-foreground text-[10px] font-black uppercase rounded-xl"
                            >
                              Save Note
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button type="button" onClick={() => setShowNewNote(true)} className="w-full py-4 border border-dashed border-border rounded-2xl text-[10px] font-black uppercase tracking-widest text-muted-foreground hover:bg-muted/30 transition-all">
                          Add New Internal Note
                        </button>
                      )}
                   </div>
                </TabsContent>
              </Tabs>
            </div>
          </div>
        )}
      </div>

      <DetailsDrawer isOpen={showInvoiceDrawer} onClose={() => setShowInvoiceDrawer(false)} title="New Invoice" subtitle={customer?.name}>
        <CreditInvoiceForm initialCustomerId={initialId} onSuccess={handleInvoiceSuccess} onCancel={() => setShowInvoiceDrawer(false)} />
      </DetailsDrawer>
      <DetailsDrawer isOpen={showPaymentDrawer} onClose={() => setShowPaymentDrawer(false)} title="Record Payment" subtitle={customer?.name}>
        <RecordPaymentForm initialCustomerId={initialId} onSuccess={handlePaymentSuccess} onCancel={() => setShowPaymentDrawer(false)} />
      </DetailsDrawer>
    </div>
  );
};
