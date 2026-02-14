import { index, numeric, pgTable, timestamp, uuid } from 'drizzle-orm/pg-core';
import { auditColumns } from '../shared';
import { supplierPayments } from './supplier-payments';
import { supplierInvoices } from './supplier-invoices';

export const supplierPaymentAllocations = pgTable(
  'supplier_payment_allocations',
  {
    ...auditColumns,
    paymentId: uuid('payment_id')
      .notNull()
      .references(() => supplierPayments.id, { onDelete: 'cascade' }),
    invoiceId: uuid('invoice_id')
      .notNull()
      .references(() => supplierInvoices.id, { onDelete: 'restrict' }),
    amount: numeric('amount', { precision: 18, scale: 2 }).notNull(),
  },
  (t) => [
    index('supplier_payment_allocations_payment_id_idx').on(t.paymentId),
    index('supplier_payment_allocations_invoice_id_idx').on(t.invoiceId),
  ],
);
