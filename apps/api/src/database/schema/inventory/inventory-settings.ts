import { index, numeric, pgTable, uuid, varchar } from 'drizzle-orm/pg-core';
import { branches } from '../core/branches';
import { companies } from '../core/companies';

/** Alert thresholds and settings: global (branchId=null) or per-branch */
export const inventorySettings = pgTable(
  'inventory_settings',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    key: varchar('key', { length: 64 }).notNull(),
    value: varchar('value', { length: 255 }).notNull(),
    companyId: uuid('company_id').references(() => companies.id, { onDelete: 'cascade' }),
    branchId: uuid('branch_id').references(() => branches.id, { onDelete: 'cascade' }),
  },
  (t) => [
    index('inventory_settings_key_branch_idx').on(t.key, t.branchId),
    index('inventory_settings_company_id_idx').on(t.companyId),
  ],
);
