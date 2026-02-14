import { index, numeric, pgTable, timestamp, uniqueIndex, uuid, varchar } from 'drizzle-orm/pg-core';
import { auditColumns } from '../shared';
import { companies } from '../core/companies';

export const suppliers = pgTable(
  'suppliers',
  {
    ...auditColumns,
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'restrict' }),
    code: varchar('code', { length: 32 }).notNull(),
    name: varchar('name', { length: 255 }).notNull(),
    category: varchar('category', { length: 64 }),
    avgVariance: numeric('avg_variance', { precision: 10, scale: 4 }),
    rating: varchar('rating', { length: 32 }),
    status: varchar('status', { length: 20 }).notNull().default('active'),
  },
  (t) => [
    uniqueIndex('suppliers_company_code_unique').on(t.companyId, t.code),
    index('suppliers_company_id_idx').on(t.companyId),
  ],
);
