import { index, numeric, pgTable, timestamp, uniqueIndex, uuid, varchar } from 'drizzle-orm/pg-core';
import { auditColumns } from '../shared';
import { branches } from '../core/branches';
import { companies } from '../core/companies';
import { products } from './products';

export const tanks = pgTable(
  'tanks',
  {
    ...auditColumns,
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'restrict' }),
    branchId: uuid('branch_id')
      .notNull()
      .references(() => branches.id, { onDelete: 'restrict' }),
    code: varchar('code', { length: 32 }).notNull(),
    productId: uuid('product_id').references(() => products.id, { onDelete: 'restrict' }),
    capacity: numeric('capacity', { precision: 18, scale: 3 }).notNull(),
    minLevel: numeric('min_level', { precision: 18, scale: 3 }).notNull().default('0'),
    maxLevel: numeric('max_level', { precision: 18, scale: 3 }).notNull(),
    currentLevel: numeric('current_level', { precision: 18, scale: 3 }).notNull().default('0'),
    calibrationProfile: varchar('calibration_profile', { length: 64 }),
    status: varchar('status', { length: 20 }).notNull().default('active'),
  },
  (t) => [
    uniqueIndex('tanks_branch_code_unique').on(t.branchId, t.code),
    index('tanks_company_id_idx').on(t.companyId),
    index('tanks_branch_id_idx').on(t.branchId),
    index('tanks_product_id_idx').on(t.productId),
  ],
);
