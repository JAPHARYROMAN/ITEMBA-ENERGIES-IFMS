import { index, numeric, pgTable, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import { auditColumns } from '../shared';
import { companies } from '../core/companies';
import { branches } from '../core/branches';
import { suppliers } from './suppliers';

export const supplierInvoices = pgTable(
  'supplier_invoices',
  {
    ...auditColumns,
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'restrict' }),
    branchId: uuid('branch_id')
      .notNull()
      .references(() => branches.id, { onDelete: 'restrict' }),
    supplierId: uuid('supplier_id')
      .notNull()
      .references(() => suppliers.id, { onDelete: 'restrict' }),
    invoiceNumber: varchar('invoice_number', { length: 64 }).notNull(),
    invoiceDate: timestamp('invoice_date', { withTimezone: true }).notNull(),
    dueDate: timestamp('due_date', { withTimezone: true }).notNull(),
    totalAmount: numeric('total_amount', { precision: 18, scale: 2 }).notNull(),
    balanceRemaining: numeric('balance_remaining', { precision: 18, scale: 2 }).notNull(),
    status: varchar('status', { length: 20 }).notNull().default('unpaid'),
  },
  (t) => [
    index('supplier_invoices_company_branch_date_idx').on(t.companyId, t.branchId, t.invoiceDate),
    index('supplier_invoices_supplier_id_idx').on(t.supplierId),
    index('supplier_invoices_status_idx').on(t.status),
  ],
);
