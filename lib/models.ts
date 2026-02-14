
import { z } from 'zod';

// --- Setup ---
export const CompanySchema = z.object({
  id: z.string(),
  name: z.string(),
  code: z.string(),
  status: z.enum(['active', 'inactive']),
});
export type Company = z.infer<typeof CompanySchema>;

export const StationSchema = z.object({
  id: z.string(),
  companyId: z.string(),
  name: z.string(),
  location: z.string(),
  manager: z.string(),
});
export type Station = z.infer<typeof StationSchema>;

export const BranchSchema = z.object({
  id: z.string(),
  stationId: z.string(),
  name: z.string(),
});
export type Branch = z.infer<typeof BranchSchema>;

export const ProductSchema = z.object({
  id: z.string(),
  name: z.string(),
  pricePerUnit: z.number(),
  category: z.enum(['Fuel', 'Lubricant', 'Other']),
});
export type Product = z.infer<typeof ProductSchema>;

export const TankSchema = z.object({
  id: z.string(),
  companyId: z.string(),
  stationId: z.string(),
  branchId: z.string(),
  code: z.string(),
  productId: z.string(),
  capacity: z.number(),
  minLevel: z.number(),
  maxLevel: z.number(),
  calibrationProfile: z.string(),
  notes: z.string().optional(),
  currentLevel: z.number(),
});
export type Tank = z.infer<typeof TankSchema>;

export const NozzleSchema = z.object({
  id: z.string(),
  stationId: z.string(),
  pumpCode: z.string(),
  nozzleCode: z.string(),
  productId: z.string(),
  tankId: z.string(),
  status: z.enum(['Active', 'Inactive']),
});
export type Nozzle = z.infer<typeof NozzleSchema>;

export const SupplierSchema = z.object({
  id: z.string(),
  name: z.string(),
  category: z.string(),
  avgVariance: z.number(),
  rating: z.enum(['Elite', 'Standard', 'At Risk']),
});
export type Supplier = z.infer<typeof SupplierSchema>;

// --- Expenses & Petty Cash ---
export const ExpenseStatusSchema = z.enum(['Draft', 'Submitted', 'Approved', 'Rejected']);
export type ExpenseStatus = z.infer<typeof ExpenseStatusSchema>;

export const ExpenseSchema = z.object({
  id: z.string(),
  timestamp: z.string(),
  branchId: z.string(),
  category: z.string(),
  amount: z.number(),
  vendor: z.string(),
  paymentMethod: z.enum(['Cash', 'Bank Transfer', 'Corporate Card', 'Petty Cash']),
  description: z.string(),
  status: ExpenseStatusSchema,
  billableDepartment: z.string().optional(),
  rejectionReason: z.string().optional(),
  attachmentName: z.string().optional(),
  governanceApprovalStatus: z.string().optional(),
  governanceApprovalRequestId: z.string().optional(),
});
export type Expense = z.infer<typeof ExpenseSchema>;

export const PettyCashTxSchema = z.object({
  id: z.string(),
  timestamp: z.string(),
  type: z.enum(['Top-up', 'Spend']),
  amount: z.number(),
  category: z.string().optional(),
  notes: z.string(),
  balanceAfter: z.number(),
});
export type PettyCashTx = z.infer<typeof PettyCashTxSchema>;

// --- Credit Management ---
export const CustomerSchema = z.object({
  id: z.string(),
  name: z.string(),
  phone: z.string().optional(),
  email: z.string().email().optional(),
  address: z.string().optional(),
  taxId: z.string().optional(),
  creditLimit: z.number(),
  paymentTerms: z.string(),
  status: z.enum(['Active', 'Suspended', 'Closed']),
  balance: z.number(),
});
export type Customer = z.infer<typeof CustomerSchema>;

export const InvoiceItemSchema = z.object({
  productId: z.string(),
  productName: z.string(),
  quantity: z.number(),
  unitPrice: z.number(),
  tax: z.number(),
  total: z.number(),
});

export const InvoiceSchema = z.object({
  id: z.string(),
  customerId: z.string(),
  customerName: z.string(),
  date: z.string(),
  dueDate: z.string(),
  status: z.enum(['Unpaid', 'Partial', 'Paid']),
  totalAmount: z.number(),
  balanceRemaining: z.number(),
  items: z.array(InvoiceItemSchema),
});
export type Invoice = z.infer<typeof InvoiceSchema>;

export const PaymentAllocationSchema = z.object({
  invoiceId: z.string(),
  amount: z.number(),
});

export const CustomerPaymentSchema = z.object({
  id: z.string(),
  customerId: z.string(),
  amount: z.number(),
  method: z.enum(['Cash', 'Bank Transfer', 'Cheque', 'Credit Card']),
  date: z.string(),
  referenceNo: z.string().optional(),
  allocations: z.array(PaymentAllocationSchema),
});
export type CustomerPayment = z.infer<typeof CustomerPaymentSchema>;

// --- Operations & Others ---
export const DeliverySchema = z.object({
  id: z.string(),
  supplierId: z.string(),
  deliveryNote: z.string(),
  vehicleNo: z.string(),
  driverName: z.string(),
  productId: z.string(),
  orderedQty: z.number(),
  expectedDate: z.string(),
  receivedQty: z.number().optional(),
  density: z.number().optional(),
  temperature: z.number().optional(),
  status: z.enum(['Pending', 'Completed', 'Cancelled']),
  timestamp: z.string(),
});
export type Delivery = z.infer<typeof DeliverySchema>;

export const SaleSchema = z.object({
  id: z.string(),
  timestamp: z.string(),
  stationId: z.string(),
  productId: z.string(),
  quantity: z.number(),
  totalAmount: z.number(),
  paymentType: z.enum(['Cash', 'Credit', 'Card']),
});
export type Sale = z.infer<typeof SaleSchema>;

export const ShiftSchema = z.object({
  id: z.string(),
  stationId: z.string(),
  startTime: z.string(),
  endTime: z.string().optional(),
  status: z.enum(['open', 'closed', 'draft']),
  cashierId: z.string(),
  readings: z.array(z.any()),
});
export type Shift = z.infer<typeof ShiftSchema>;
