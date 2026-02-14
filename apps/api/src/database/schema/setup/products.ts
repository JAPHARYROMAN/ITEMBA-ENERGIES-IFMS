import { index, pgTable, numeric, timestamp, uniqueIndex, uuid, varchar } from 'drizzle-orm/pg-core';
import { auditColumns } from '../shared';
import { companies } from '../core/companies';

export const products = pgTable(
  'products',
  {
    ...auditColumns,
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'restrict' }),
    code: varchar('code', { length: 32 }).notNull(),
    name: varchar('name', { length: 255 }).notNull(),
    category: varchar('category', { length: 64 }).notNull(),
    pricePerUnit: numeric('price_per_unit', { precision: 18, scale: 2 }).notNull(),
    unit: varchar('unit', { length: 16 }).notNull().default('L'),
    status: varchar('status', { length: 20 }).notNull().default('active'),
  },
  (t) => [
    uniqueIndex('products_company_code_unique').on(t.companyId, t.code),
    index('products_company_id_idx').on(t.companyId),
  ],
);
