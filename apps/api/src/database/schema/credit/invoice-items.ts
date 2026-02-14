import { index, numeric, pgTable, timestamp, uuid } from 'drizzle-orm/pg-core';
import { auditColumns } from '../shared';
import { creditInvoices } from './credit-invoices';
import { products } from '../setup/products';

export const invoiceItems = pgTable(
  'invoice_items',
  {
    ...auditColumns,
    invoiceId: uuid('invoice_id')
      .notNull()
      .references(() => creditInvoices.id, { onDelete: 'cascade' }),
    productId: uuid('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'restrict' }),
    quantity: numeric('quantity', { precision: 18, scale: 3 }).notNull(),
    unitPrice: numeric('unit_price', { precision: 18, scale: 2 }).notNull(),
    tax: numeric('tax', { precision: 18, scale: 2 }).default('0'),
    total: numeric('total', { precision: 18, scale: 2 }).notNull(),
  },
  (t) => [
    index('invoice_items_invoice_id_idx').on(t.invoiceId),
    index('invoice_items_product_id_idx').on(t.productId),
  ],
);
