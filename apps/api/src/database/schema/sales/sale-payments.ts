import { index, numeric, pgTable, uuid, varchar } from 'drizzle-orm/pg-core';
import { auditColumns } from '../shared';
import { salesTransactions } from './sales-transactions';

export const salePayments = pgTable(
  'sale_payments',
  {
    ...auditColumns,
    saleTransactionId: uuid('sale_transaction_id')
      .notNull()
      .references(() => salesTransactions.id, { onDelete: 'cascade' }),
    paymentMethod: varchar('payment_method', { length: 32 }).notNull(),
    amount: numeric('amount', { precision: 18, scale: 2 }).notNull(),
  },
  (t) => [
    index('sale_payments_sale_transaction_id_idx').on(t.saleTransactionId),
  ],
);
