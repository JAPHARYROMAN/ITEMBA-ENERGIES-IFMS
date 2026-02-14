import { index, numeric, pgTable, timestamp, uuid } from 'drizzle-orm/pg-core';
import { auditColumns } from '../shared';
import { payments } from './payments';
import { creditInvoices } from './credit-invoices';

export const paymentAllocations = pgTable(
  'payment_allocations',
  {
    ...auditColumns,
    paymentId: uuid('payment_id')
      .notNull()
      .references(() => payments.id, { onDelete: 'cascade' }),
    invoiceId: uuid('invoice_id')
      .notNull()
      .references(() => creditInvoices.id, { onDelete: 'restrict' }),
    amount: numeric('amount', { precision: 18, scale: 2 }).notNull(),
  },
  (t) => [
    index('payment_allocations_payment_id_idx').on(t.paymentId),
    index('payment_allocations_invoice_id_idx').on(t.invoiceId),
  ],
);
