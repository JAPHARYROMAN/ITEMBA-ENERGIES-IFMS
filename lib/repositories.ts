import { apiFetch } from './api/client';
import { apiSetup } from './api/setup';
import { apiGovernance } from './api/governance';
import {
  Delivery,
  Supplier,
  Tank,
  Nozzle,
  Shift,
  Sale,
  Customer,
  Expense,
  Branch,
  Invoice,
  CustomerPayment,
  PettyCashTx,
  Product,
  Company,
  Station,
} from './models';

interface ListMeta {
  page: number;
  pageSize: number;
  total: number;
}

interface ListResponse<T> {
  data: T[];
  meta: ListMeta;
}

interface DefaultContext {
  companyId: string;
  stationId: string;
  branchId: string;
}

const uiToApiPaymentMethod: Record<string, string> = {
  'Petty Cash': 'petty_cash',
  'Bank Transfer': 'bank',
  Cash: 'cash',
  'Corporate Card': 'card',
  Card: 'card',
};

const uiToApiCustomerStatus: Record<string, string> = {
  Active: 'active',
  Suspended: 'suspended',
  Closed: 'closed',
};

let cachedDefaultContext: DefaultContext | null = null;

async function listAll<T>(path: string, params?: Record<string, string | number | undefined>): Promise<T[]> {
  const search = new URLSearchParams();
  search.set('page', '1');
  search.set('pageSize', '500');
  if (params) {
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== '') search.set(k, String(v));
    });
  }
  const res = await apiFetch<ListResponse<T>>(`${path}?${search.toString()}`);
  return res.data ?? [];
}

function toUiCustomerStatus(status: string): Customer['status'] {
  const s = status.toLowerCase();
  if (s === 'active') return 'Active';
  if (s === 'suspended') return 'Suspended';
  return 'Closed';
}

function toUiInvoiceStatus(status: string): Invoice['status'] {
  const s = status.toLowerCase();
  if (s === 'paid') return 'Paid';
  if (s === 'partial') return 'Partial';
  return 'Unpaid';
}

function toUiExpenseStatus(status: string): Expense['status'] {
  const s = status.toLowerCase();
  if (s === 'approved') return 'Approved';
  if (s === 'rejected') return 'Rejected';
  if (s === 'pending_approval') return 'Submitted';
  if (s === 'submitted') return 'Submitted';
  return 'Draft';
}

function toUiNozzleStatus(status: string): Nozzle['status'] {
  return status.toLowerCase() === 'inactive' ? 'Inactive' : 'Active';
}

async function getDefaultContext(): Promise<DefaultContext> {
  if (cachedDefaultContext) return cachedDefaultContext;

  const [stations, branches] = await Promise.all([
    apiSetup.stations.list(),
    apiSetup.branches.list(),
  ]);

  const branch = branches[0];
  if (!branch) throw new Error('No branches found. Create a branch in setup first.');

  const station = stations.find((s) => s.id === branch.stationId);
  if (!station) throw new Error('No station found for selected branch.');

  cachedDefaultContext = {
    companyId: station.companyId,
    stationId: station.id,
    branchId: branch.id,
  };
  return cachedDefaultContext;
}

async function resolveCompanyIdFromBranch(branchId: string): Promise<string> {
  const [stations, branches] = await Promise.all([
    apiSetup.stations.list(),
    apiSetup.branches.list(),
  ]);
  const branch = branches.find((b) => b.id === branchId);
  if (!branch) {
    const ctx = await getDefaultContext();
    return ctx.companyId;
  }
  const station = stations.find((s) => s.id === branch.stationId);
  if (!station) {
    const ctx = await getDefaultContext();
    return ctx.companyId;
  }
  return station.companyId;
}

function mapApiProduct(row: {
  id: string;
  name: string;
  pricePerUnit: string | number;
  category: string;
}): Product {
  return {
    id: row.id,
    name: row.name,
    pricePerUnit: Number(row.pricePerUnit),
    category: row.category as Product['category'],
  };
}

function mapApiTank(row: {
  id: string;
  companyId: string;
  stationId?: string;
  branchId: string;
  code: string;
  productId: string | null;
  capacity: string | number;
  minLevel: string | number;
  maxLevel: string | number;
  calibrationProfile: string | null;
  currentLevel: string | number;
}): Tank {
  return {
    id: row.id,
    companyId: row.companyId,
    stationId: row.stationId ?? '',
    branchId: row.branchId,
    code: row.code,
    productId: row.productId ?? '',
    capacity: Number(row.capacity),
    minLevel: Number(row.minLevel),
    maxLevel: Number(row.maxLevel),
    calibrationProfile: row.calibrationProfile ?? '',
    currentLevel: Number(row.currentLevel),
  };
}

export const companyRepo = {
  list: async (): Promise<Company[]> => apiSetup.companies.list() as Promise<Company[]>,
};

export const stationRepo = {
  list: async (): Promise<Station[]> => apiSetup.stations.list() as Promise<Station[]>,
};

export const supplierRepo = {
  list: async (): Promise<Supplier[]> => {
    const rows = await listAll<{
      id: string;
      name: string;
      category: string | null;
      avgVariance: string | null;
      rating: string | null;
    }>('suppliers');
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      category: r.category ?? 'General',
      avgVariance: Number(r.avgVariance ?? 0),
      rating: ((r.rating ?? 'Standard').toLowerCase() === 'elite'
        ? 'Elite'
        : (r.rating ?? 'Standard').toLowerCase() === 'at risk'
          ? 'At Risk'
          : 'Standard') as Supplier['rating'],
    }));
  },
};

export const branchRepo = {
  list: async (stationId?: string): Promise<Branch[]> =>
    apiSetup.branches.list(stationId) as Promise<Branch[]>,
};

export const productRepo = {
  list: async (): Promise<Product[]> => {
    const rows = await apiSetup.products.list();
    return rows.map(mapApiProduct);
  },
  create: async (data: any): Promise<Product> => {
    const ctx = await getDefaultContext();
    const created = await apiSetup.products.create({
      companyId: data.companyId ?? ctx.companyId,
      code: data.code,
      name: data.name,
      category: data.category,
      pricePerUnit: Number(data.pricePerUnit),
      unit: data.unit ?? 'litre',
      status: data.status ?? 'active',
    });
    return mapApiProduct(created);
  },
};

export const tankRepo = {
  list: async (stationId?: string): Promise<Tank[]> => {
    const rows = await apiSetup.tanks.list(stationId);
    return rows.map(mapApiTank);
  },
  create: async (data: any): Promise<Tank> => {
    const created = await apiSetup.tanks.create({
      companyId: data.companyId,
      branchId: data.branchId,
      productId: data.productId || undefined,
      code: data.code,
      capacity: Number(data.capacity),
      minLevel: Number(data.minLevel),
      maxLevel: Number(data.maxLevel),
      calibrationProfile: data.calibrationProfile,
      status: 'active',
    });
    return mapApiTank({ ...created, stationId: data.stationId });
  },
};

export const customerRepo = {
  list: async (): Promise<Customer[]> => {
    const rows = await listAll<{
      id: string;
      name: string;
      phone: string | null;
      email: string | null;
      address: string | null;
      taxId: string | null;
      creditLimit: string;
      paymentTerms: string;
      status: string;
      balance: string;
    }>('customers');
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      phone: r.phone ?? undefined,
      email: r.email ?? undefined,
      address: r.address ?? undefined,
      taxId: r.taxId ?? undefined,
      creditLimit: Number(r.creditLimit),
      paymentTerms: r.paymentTerms,
      status: toUiCustomerStatus(r.status),
      balance: Number(r.balance),
    }));
  },
  get: async (id: string): Promise<Customer | undefined> => {
    const r = await apiFetch<{
      id: string;
      name: string;
      phone: string | null;
      email: string | null;
      address: string | null;
      taxId: string | null;
      creditLimit: string;
      paymentTerms: string;
      status: string;
      balance: string;
    }>(`customers/${id}`);
    return {
      id: r.id,
      name: r.name,
      phone: r.phone ?? undefined,
      email: r.email ?? undefined,
      address: r.address ?? undefined,
      taxId: r.taxId ?? undefined,
      creditLimit: Number(r.creditLimit),
      paymentTerms: r.paymentTerms,
      status: toUiCustomerStatus(r.status),
      balance: Number(r.balance),
    };
  },
  create: async (data: any): Promise<Customer> => {
    const ctx = await getDefaultContext();
    const branchId = data.branchId ?? ctx.branchId;
    const created = await apiFetch<{
      id: string;
      name: string;
      phone: string | null;
      email: string | null;
      address: string | null;
      taxId: string | null;
      creditLimit: string;
      paymentTerms: string;
      status: string;
      balance: string;
    }>('customers', {
      method: 'POST',
      body: {
        branchId,
        code: data.code ?? `CUST-${Date.now().toString().slice(-6)}`,
        name: data.name,
        email: data.email,
        phone: data.phone,
        address: data.address,
        taxId: data.taxId,
        creditLimit: Number(data.creditLimit),
        paymentTerms: data.paymentTerms ?? 'net30',
        status:
          data.status
            ? (uiToApiCustomerStatus[data.status] ?? data.status.toLowerCase())
            : data.isActive === false
              ? 'suspended'
              : 'active',
      },
    });
    return {
      id: created.id,
      name: created.name,
      phone: created.phone ?? undefined,
      email: created.email ?? undefined,
      address: created.address ?? undefined,
      taxId: created.taxId ?? undefined,
      creditLimit: Number(created.creditLimit),
      paymentTerms: created.paymentTerms,
      status: toUiCustomerStatus(created.status),
      balance: Number(created.balance),
    };
  },
};

export const invoiceRepo = {
  list: async (customerId?: string): Promise<Invoice[]> => {
    const rows = await listAll<{
      id: string;
      invoiceNumber: string;
      customerId: string;
      invoiceDate: string;
      dueDate: string;
      status: string;
      totalAmount: string;
      balanceRemaining: string;
    }>('credit-invoices', customerId ? { customerId } : undefined);
    return rows.map((r) => ({
      id: r.invoiceNumber,
      customerId: r.customerId,
      customerName: '',
      date: new Date(r.invoiceDate).toISOString().slice(0, 10),
      dueDate: new Date(r.dueDate).toISOString().slice(0, 10),
      status: toUiInvoiceStatus(r.status),
      totalAmount: Number(r.totalAmount),
      balanceRemaining: Number(r.balanceRemaining),
      items: [],
    }));
  },
  getUnpaid: async (customerId: string): Promise<Invoice[]> => {
    const invoices = await invoiceRepo.list(customerId);
    return invoices.filter((i) => i.status !== 'Paid' && i.balanceRemaining > 0);
  },
  create: async (data: any): Promise<Invoice> => {
    const created = await apiFetch<{
      id: string;
      invoiceNumber: string;
      customerId: string;
      invoiceDate: string;
      dueDate: string;
      status: string;
      totalAmount: string;
      balanceRemaining: string;
      items: Array<{ productId: string; quantity: string; unitPrice: string; tax: string | null; total: string }>;
    }>('credit-invoices', {
      method: 'POST',
      body: {
        customerId: data.customerId,
        invoiceDate: data.date,
        dueDate: data.dueDate,
        items: data.items.map((i) => ({
          productId: i.productId,
          quantity: Number(i.quantity),
          unitPrice: Number(i.unitPrice),
          tax: Number(i.tax ?? 0),
        })),
      },
    });

    return {
      id: created.invoiceNumber,
      customerId: created.customerId,
      customerName: '',
      date: new Date(created.invoiceDate).toISOString().slice(0, 10),
      dueDate: new Date(created.dueDate).toISOString().slice(0, 10),
      status: toUiInvoiceStatus(created.status),
      totalAmount: Number(created.totalAmount),
      balanceRemaining: Number(created.balanceRemaining),
      items: created.items.map((i) => ({
        productId: i.productId,
        productName: i.productId,
        quantity: Number(i.quantity),
        unitPrice: Number(i.unitPrice),
        tax: Number(i.tax ?? 0),
        total: Number(i.total),
      })),
    };
  },
};

export const paymentRepo = {
  list: async (customerId?: string): Promise<CustomerPayment[]> => {
    const rows = await listAll<{
      id: string;
      customerId: string;
      amount: string;
      method: string;
      paymentDate: string;
      referenceNo: string | null;
    }>('payments', customerId ? { customerId } : undefined);
    return rows.map((r) => ({
      id: r.id,
      customerId: r.customerId,
      amount: Number(r.amount),
      method: r.method as CustomerPayment['method'],
      date: new Date(r.paymentDate).toISOString().slice(0, 10),
      referenceNo: r.referenceNo ?? undefined,
      allocations: [],
    }));
  },
  create: async (data: any): Promise<CustomerPayment> => {
    const created = await apiFetch<{
      id: string;
      customerId: string;
      amount: string;
      method: string;
      paymentDate: string;
      referenceNo: string | null;
    }>('payments', {
      method: 'POST',
      body: {
        customerId: data.customerId,
        amount: Number(data.amount),
        method: data.method,
        paymentDate: data.date,
        referenceNo: data.referenceNo,
        allocations: data.allocations,
      },
    });
    return {
      id: created.id,
      customerId: created.customerId,
      amount: Number(created.amount),
      method: created.method as CustomerPayment['method'],
      date: new Date(created.paymentDate).toISOString().slice(0, 10),
      referenceNo: created.referenceNo ?? undefined,
      allocations: data.allocations ?? [],
    };
  },
};

export const expenseRepo = {
  list: async (): Promise<Expense[]> => {
    const [rows, approvals] = await Promise.all([
      listAll<{
        id: string;
        branchId: string;
        category: string;
        amount: string;
        vendor: string;
        paymentMethod: string;
        description: string | null;
        billableDepartment: string | null;
        attachmentName: string | null;
        rejectionReason: string | null;
        status: string;
        createdAt: string;
      }>('expense-entries'),
      listAll<{
        id: string;
        entityId: string;
        entityType: string;
        status: string;
        requestedAt: string;
      }>('governance/approvals', { entityType: 'expense_entry' }),
    ]);

    const latestApprovalByEntity = new Map<string, { id: string; status: string; requestedAt: string }>();
    approvals
      .filter((a) => a.entityType === 'expense_entry')
      .sort((a, b) => new Date(b.requestedAt).getTime() - new Date(a.requestedAt).getTime())
      .forEach((a) => {
        if (!latestApprovalByEntity.has(a.entityId)) {
          latestApprovalByEntity.set(a.entityId, { id: a.id, status: a.status, requestedAt: a.requestedAt });
        }
      });

    return rows.map((r) => {
      const approval = latestApprovalByEntity.get(r.id);
      return {
        id: r.id,
        timestamp: new Date(r.createdAt).toISOString(),
        branchId: r.branchId,
        category: r.category,
        amount: Number(r.amount),
        vendor: r.vendor,
        paymentMethod:
          r.paymentMethod === 'petty_cash'
            ? 'Petty Cash'
            : r.paymentMethod === 'bank'
              ? 'Bank Transfer'
              : r.paymentMethod === 'card'
                ? 'Corporate Card'
                : 'Cash',
        description: r.description ?? '',
        status: toUiExpenseStatus(r.status),
        billableDepartment: r.billableDepartment ?? undefined,
        rejectionReason: r.rejectionReason ?? undefined,
        attachmentName: r.attachmentName ?? undefined,
        governanceApprovalStatus: approval?.status,
        governanceApprovalRequestId: approval?.id,
      };
    });
  },
  create: async (data: any): Promise<Expense> => {
    const ctx = await getDefaultContext();
    const branchId = data.branchId ?? ctx.branchId;
    const companyId = await resolveCompanyIdFromBranch(branchId);

    const created = await apiFetch<{
      id: string;
      branchId: string;
      category: string;
      amount: string;
      vendor: string;
      paymentMethod: string;
      description: string | null;
      billableDepartment: string | null;
      attachmentName: string | null;
      rejectionReason: string | null;
      status: string;
      createdAt: string;
    }>('expense-entries', {
      method: 'POST',
      body: {
        companyId,
        branchId,
        category: data.category,
        amount: Number(data.amount),
        vendor: data.vendor,
        paymentMethod: uiToApiPaymentMethod[data.paymentMethod] ?? 'other',
        description: data.description,
        billableDepartment: data.billableDepartment,
        attachmentName: data.attachmentName,
      },
    });

    // Keep prior UX behavior by immediately submitting after draft creation.
    let submitted: typeof created;
    try {
      submitted = await apiFetch<typeof created>(`expense-entries/${created.id}/submit`, {
        method: 'POST',
        body: {},
      });
    } catch (err: any) {
      const details = err?.apiError?.details as any;
      const nested = details?.message;
      const approvalRequestId =
        nested?.approvalRequestId ??
        details?.approvalRequestId ??
        err?.apiError?.approvalRequestId;
      if (approvalRequestId) {
        throw Object.assign(new Error(nested?.message ?? 'Governance approval required'), {
          statusCode: err?.statusCode ?? 409,
          apiError: {
            ...(err?.apiError ?? {}),
            message: nested?.message ?? 'Governance approval required',
            details: nested,
            approvalRequestId,
          },
        });
      }
      throw err;
    }

    let governanceApprovalRequestId: string | undefined;
    let governanceApprovalStatus: string | undefined;
    if (submitted.status?.toLowerCase() === 'pending_approval') {
      const approvals = await apiGovernance.listApprovals({ entityType: 'expense_entry' });
      const match = approvals
        .filter((a) => a.entityId === submitted.id)
        .sort((a, b) => new Date(b.requestedAt).getTime() - new Date(a.requestedAt).getTime())[0];
      governanceApprovalRequestId = match?.id;
      governanceApprovalStatus = match?.status;
    }

    return {
      id: submitted.id,
      timestamp: new Date(submitted.createdAt).toISOString(),
      branchId: submitted.branchId,
      category: submitted.category,
      amount: Number(submitted.amount),
      vendor: submitted.vendor,
      paymentMethod: data.paymentMethod as Expense['paymentMethod'],
      description: submitted.description ?? '',
      status: toUiExpenseStatus(submitted.status),
      billableDepartment: submitted.billableDepartment ?? undefined,
      rejectionReason: submitted.rejectionReason ?? undefined,
      attachmentName: submitted.attachmentName ?? undefined,
      governanceApprovalStatus,
      governanceApprovalRequestId,
    };
  },
  updateStatus: async (id: string, status: Expense['status'], reason?: string) => {
    if (status === 'Submitted') {
      await apiFetch(`expense-entries/${id}/submit`, { method: 'POST', body: {} });
    } else if (status === 'Approved') {
      await apiFetch(`expense-entries/${id}/approve`, { method: 'POST', body: {} });
    } else if (status === 'Rejected') {
      await apiFetch(`expense-entries/${id}/reject`, { method: 'POST', body: { reason: reason ?? '' } });
    }
    return { success: true };
  },
};

export const pettyCashRepo = {
  getBalance: async (): Promise<number> => {
    const ctx = await getDefaultContext();
    const res = await apiFetch<ListResponse<{
      id: string;
      balanceAfter: string;
    }> & { balance: number }>(
      `petty-cash/ledger?page=1&pageSize=1&companyId=${ctx.companyId}&branchId=${ctx.branchId}`,
    );
    if (typeof res.balance === 'number') return res.balance;
    return Number(res.data?.[0]?.balanceAfter ?? 0);
  },
  list: async (): Promise<PettyCashTx[]> => {
    const ctx = await getDefaultContext();
    const res = await apiFetch<ListResponse<{
      id: string;
      transactionType: string;
      amount: string;
      category: string | null;
      notes: string;
      balanceAfter: string;
      createdAt: string;
    }> & { balance: number }>(
      `petty-cash/ledger?page=1&pageSize=500&companyId=${ctx.companyId}&branchId=${ctx.branchId}`,
    );

    return (res.data ?? []).map((r) => ({
      id: r.id,
      timestamp: new Date(r.createdAt).toISOString(),
      type: r.transactionType === 'topup' ? 'Top-up' : 'Spend',
      amount: Number(r.amount),
      category: r.category ?? undefined,
      notes: r.notes,
      balanceAfter: Number(r.balanceAfter),
    }));
  },
  transact: async (data: any): Promise<PettyCashTx> => {
    const ctx = await getDefaultContext();
    const path = data.type === 'Top-up' ? 'petty-cash/topup' : 'petty-cash/spend';
    const created = await apiFetch<{
      id: string;
      transactionType: string;
      amount: string;
      category: string | null;
      notes: string;
      balanceAfter: string;
      createdAt: string;
    }>(path, {
      method: 'POST',
      body: {
        companyId: ctx.companyId,
        branchId: ctx.branchId,
        amount: Number(data.amount),
        category: data.category,
        notes: data.notes,
      },
    });

    return {
      id: created.id,
      timestamp: new Date(created.createdAt).toISOString(),
      type: created.transactionType === 'topup' ? 'Top-up' : 'Spend',
      amount: Number(created.amount),
      category: created.category ?? undefined,
      notes: created.notes,
      balanceAfter: Number(created.balanceAfter),
    };
  },
};

export const deliveryRepo = {
  list: async (): Promise<Delivery[]> => {
    const rows = await listAll<{
      id: string;
      supplierId: string | null;
      deliveryNote: string;
      vehicleNo: string | null;
      driverName: string | null;
      productId: string | null;
      orderedQty: string;
      expectedDate: string;
      receivedQty: string | null;
      density: string | null;
      temperature: string | null;
      status: string;
      createdAt: string;
    }>('deliveries');

    return rows.map((r) => ({
      id: r.id,
      supplierId: r.supplierId ?? '',
      deliveryNote: r.deliveryNote,
      vehicleNo: r.vehicleNo ?? '',
      driverName: r.driverName ?? '',
      productId: r.productId ?? '',
      orderedQty: Number(r.orderedQty),
      expectedDate: new Date(r.expectedDate).toISOString().slice(0, 10),
      receivedQty: r.receivedQty != null ? Number(r.receivedQty) : undefined,
      density: r.density != null ? Number(r.density) : undefined,
      temperature: r.temperature != null ? Number(r.temperature) : undefined,
      status: r.status.toLowerCase() === 'completed' ? 'Completed' : r.status.toLowerCase() === 'cancelled' ? 'Cancelled' : 'Pending',
      timestamp: new Date(r.createdAt).toISOString(),
    }));
  },
  create: async (data: any): Promise<Delivery> => {
    const ctx = await getDefaultContext();
    const created = await apiFetch<{
      id: string;
      supplierId: string | null;
      deliveryNote: string;
      vehicleNo: string | null;
      driverName: string | null;
      productId: string | null;
      orderedQty: string;
      expectedDate: string;
      receivedQty: string | null;
      density: string | null;
      temperature: string | null;
      status: string;
      createdAt: string;
    }>('deliveries', {
      method: 'POST',
      body: {
        branchId: data.branchId ?? ctx.branchId,
        supplierId: data.supplierId || undefined,
        deliveryNote: data.deliveryNote,
        vehicleNo: data.vehicleNo,
        driverName: data.driverName,
        productId: data.productId || undefined,
        orderedQty: Number(data.orderedQty),
        expectedDate: data.expectedDate,
      },
    });

    return {
      id: created.id,
      supplierId: created.supplierId ?? '',
      deliveryNote: created.deliveryNote,
      vehicleNo: created.vehicleNo ?? '',
      driverName: created.driverName ?? '',
      productId: created.productId ?? '',
      orderedQty: Number(created.orderedQty),
      expectedDate: new Date(created.expectedDate).toISOString().slice(0, 10),
      receivedQty: created.receivedQty != null ? Number(created.receivedQty) : undefined,
      density: created.density != null ? Number(created.density) : undefined,
      temperature: created.temperature != null ? Number(created.temperature) : undefined,
      status: created.status.toLowerCase() === 'completed' ? 'Completed' : created.status.toLowerCase() === 'cancelled' ? 'Cancelled' : 'Pending',
      timestamp: new Date(created.createdAt).toISOString(),
    };
  },
  receive: async (id: string, data: any) => {
    await apiFetch(`deliveries/${id}/grn`, {
      method: 'POST',
      body: {
        receivedQty: Number(data.receivedQty),
        density: data.density,
        temperature: data.temperature,
        allocations: data.allocations.map((a) => ({ tankId: a.tankId, quantity: Number(a.quantity) })),
        varianceReason: data.varianceReason,
      },
    });
    return { success: true };
  },
};

export const nozzleRepo = {
  list: async (stationId?: string): Promise<Nozzle[]> => {
    const rows = await apiSetup.nozzles.list(stationId);
    return rows.map((r) => ({
      id: r.id,
      stationId: r.stationId,
      pumpCode: r.pumpCode,
      nozzleCode: r.nozzleCode,
      productId: r.productId,
      tankId: r.tankId,
      status: toUiNozzleStatus(r.status),
    }));
  },
  create: async (data: any): Promise<Nozzle> => {
    if (!data.pumpId) throw new Error('Pump is required');
    const created = await apiSetup.nozzles.create({
      stationId: data.stationId,
      pumpId: data.pumpId,
      tankId: data.tankId,
      productId: data.productId,
      code: data.nozzleCode,
      status: data.status === 'Inactive' ? 'inactive' : 'active',
    });

    return {
      id: created.id,
      stationId: created.stationId,
      pumpCode: created.pumpCode,
      nozzleCode: created.nozzleCode,
      productId: created.productId,
      tankId: created.tankId,
      status: toUiNozzleStatus(created.status),
    };
  },
};

export const shiftRepo = {
  list: async (): Promise<Shift[]> => {
    const rows = await listAll<{
      id: string;
      stationId: string;
      startTime: string;
      endTime: string | null;
      status: string;
      openedBy: string | null;
    }>('shifts');

    return rows.map((r) => ({
      id: r.id,
      stationId: r.stationId,
      startTime: new Date(r.startTime).toISOString(),
      endTime: r.endTime ? new Date(r.endTime).toISOString() : undefined,
      status: (r.status.toLowerCase() === 'open' ? 'open' : r.status.toLowerCase() === 'closed' ? 'closed' : 'draft') as Shift['status'],
      cashierId: r.openedBy ?? '',
      readings: [],
    }));
  },
  open: async (data: any): Promise<Shift> => {
    const created = await apiFetch<{
      id: string;
      stationId: string;
      startTime: string;
      endTime: string | null;
      status: string;
      openedBy: string | null;
    }>('shifts/open', {
      method: 'POST',
      body: {
        branchId: data.branchId,
        openingMeterReadings: data.readings.map((r) => ({
          nozzleId: r.nozzleId,
          value: Number(r.openingReading),
          pricePerUnit: Number(r.pricePerUnit),
        })),
      },
    });

    return {
      id: created.id,
      stationId: created.stationId,
      startTime: new Date(created.startTime).toISOString(),
      endTime: created.endTime ? new Date(created.endTime).toISOString() : undefined,
      status: 'open',
      cashierId: created.openedBy ?? '',
      readings: data.readings.map((r) => ({
        nozzleId: r.nozzleId,
        nozzleCode: r.nozzleId,
        openingReading: Number(r.openingReading),
        pricePerUnit: Number(r.pricePerUnit),
      })),
    };
  },
  close: async (data: any) => {
    await apiFetch(`shifts/${data.id}/close`, {
      method: 'POST',
      body: {
        closingMeterReadings: data.readings.map((r) => ({ nozzleId: r.nozzleId, value: Number(r.closingReading) })),
        collections: [
          { paymentMethod: 'Cash', amount: Number(data.collections.cash || 0) },
          { paymentMethod: 'Card', amount: Number(data.collections.card || 0) },
          { paymentMethod: 'Mobile Money', amount: Number(data.collections.mobileMoney || 0) },
          { paymentMethod: 'Voucher', amount: Number(data.collections.voucher || 0) },
        ].filter((c) => c.amount > 0),
        varianceReason: data.varianceReason,
      },
    });
    return { success: true };
  },
  getOpen: async (stationId?: string): Promise<(Shift & { readings: Array<{ nozzleId: string; nozzleCode: string; openingReading: number; pricePerUnit: number }> }) | null> => {
    const rows = await listAll<{
      id: string;
      stationId: string;
      startTime: string;
      endTime: string | null;
      status: string;
      openedBy: string | null;
    }>('shifts', { status: 'open', stationId });

    const openShift = rows[0];
    if (!openShift) return null;

    const nozzles = await nozzleRepo.list(stationId);
    const readings = nozzles.map((n) => ({
      nozzleId: n.id,
      nozzleCode: `${n.pumpCode}-${n.nozzleCode}`,
      openingReading: 0,
      pricePerUnit: 0,
    }));

    return {
      id: openShift.id,
      stationId: openShift.stationId,
      startTime: new Date(openShift.startTime).toISOString(),
      endTime: openShift.endTime ? new Date(openShift.endTime).toISOString() : undefined,
      status: 'open',
      cashierId: openShift.openedBy ?? '',
      readings,
    };
  },
};

export const saleRepo = {
  list: async (): Promise<Sale[]> => {
    const rows = await listAll<{
      id: string;
      branchId: string;
      transactionDate: string;
      totalAmount: string;
      status: string;
    }>('sales/transactions');

    return rows.map((r) => ({
      id: r.id,
      timestamp: new Date(r.transactionDate).toISOString(),
      stationId: '',
      productId: '',
      quantity: 0,
      totalAmount: Number(r.totalAmount),
      paymentType: 'Cash',
    }));
  },
  create: async (data: any): Promise<Sale & { payment: { cash: number; card: number; mobile: number; voucher: number } }> => {
    const ctx = await getDefaultContext();
    const payments = [
      { paymentMethod: 'Cash', amount: Number(data.payment.cash || 0) },
      { paymentMethod: 'Card', amount: Number(data.payment.card || 0) },
      { paymentMethod: 'Mobile Money', amount: Number(data.payment.mobile || 0) },
      { paymentMethod: 'Voucher', amount: Number(data.payment.voucher || 0) },
    ].filter((p) => p.amount > 0);

    const created = await apiFetch<{
      id: string;
      transactionDate: string;
      totalAmount: string;
      payments: Array<{ paymentMethod: string; amount: string }>;
    }>('sales/pos', {
      method: 'POST',
      body: {
        branchId: ctx.branchId,
        items: [
          {
            productId: data.productId,
            quantity: Number(data.quantity),
            unitPrice: Number(data.pricePerUnit),
          },
        ],
        payments,
        discountAmount: Number(data.discount || 0),
        discountReason: data.priceOverrideReason,
      },
    });

    return {
      id: created.id,
      timestamp: new Date(created.transactionDate).toISOString(),
      stationId: ctx.stationId,
      productId: data.productId,
      quantity: Number(data.quantity),
      totalAmount: Number(created.totalAmount),
      paymentType: (created.payments?.[0]?.paymentMethod?.toLowerCase().includes('card') ? 'Card' : created.payments?.[0]?.paymentMethod?.toLowerCase().includes('credit') ? 'Credit' : 'Cash') as Sale['paymentType'],
      payment: {
        cash: Number(data.payment.cash || 0),
        card: Number(data.payment.card || 0),
        mobile: Number(data.payment.mobile || 0),
        voucher: Number(data.payment.voucher || 0),
      },
    };
  },
};
