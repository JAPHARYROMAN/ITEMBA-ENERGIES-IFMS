import { index, numeric, pgTable, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import { auditColumns } from '../shared';
import { companies } from '../core/companies';
import { branches } from '../core/branches';
import { customers } from './customers';

export const creditInvoices = pgTable(
  'credit_invoices',
  {
    ...auditColumns,
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'restrict' }),
    branchId: uuid('branch_id')
      .notNull()
      .references(() => branches.id, { onDelete: 'restrict' }),
    customerId: uuid('customer_id')
      .notNull()
      .references(() => customers.id, { onDelete: 'restrict' }),
    invoiceNumber: varchar('invoice_number', { length: 64 }).notNull(),
    invoiceDate: timestamp('invoice_date', { withTimezone: true }).notNull(),
    dueDate: timestamp('due_date', { withTimezone: true }).notNull(),
    totalAmount: numeric('total_amount', { precision: 18, scale: 2 }).notNull(),
    balanceRemaining: numeric('balance_remaining', { precision: 18, scale: 2 }).notNull(),
    status: varchar('status', { length: 20 }).notNull().default('unpaid'),
  },
  (t) => [
    index('credit_invoices_company_branch_date_idx').on(t.companyId, t.branchId, t.invoiceDate),
    index('credit_invoices_customer_id_idx').on(t.customerId),
    index('credit_invoices_status_idx').on(t.status),
  ],
);
