import { index, numeric, pgTable, timestamp, uuid } from 'drizzle-orm/pg-core';
import { auditColumns } from '../shared';
import { salesTransactions } from './sales-transactions';
import { products } from '../setup/products';

export const saleItems = pgTable(
  'sale_items',
  {
    ...auditColumns,
    saleTransactionId: uuid('sale_transaction_id')
      .notNull()
      .references(() => salesTransactions.id, { onDelete: 'cascade' }),
    productId: uuid('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'restrict' }),
    quantity: numeric('quantity', { precision: 18, scale: 3 }).notNull(),
    unitPrice: numeric('unit_price', { precision: 18, scale: 2 }).notNull(),
    taxAmount: numeric('tax_amount', { precision: 18, scale: 2 }).default('0'),
    totalAmount: numeric('total_amount', { precision: 18, scale: 2 }).notNull(),
  },
  (t) => [
    index('sale_items_sale_transaction_id_idx').on(t.saleTransactionId),
    index('sale_items_product_id_idx').on(t.productId),
  ],
);
