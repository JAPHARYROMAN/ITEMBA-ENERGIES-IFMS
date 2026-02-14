import { index, numeric, pgTable, text, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import { auditColumns } from '../shared';
import { salesTransactions } from './sales-transactions';

export const receipts = pgTable(
  'receipts',
  {
    ...auditColumns,
    saleTransactionId: uuid('sale_transaction_id')
      .notNull()
      .references(() => salesTransactions.id, { onDelete: 'cascade' }),
    receiptNumber: varchar('receipt_number', { length: 64 }).notNull(),
    totalAmount: numeric('total_amount', { precision: 18, scale: 2 }).notNull(),
    contentHtml: text('content_html'),
  },
  (t) => [
    index('receipts_sale_transaction_id_idx').on(t.saleTransactionId),
    index('receipts_receipt_number_idx').on(t.receiptNumber),
  ],
);
