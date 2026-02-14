import { index, pgTable, timestamp, uniqueIndex, uuid, varchar } from 'drizzle-orm/pg-core';
import { auditColumns } from '../shared';
import { companies } from '../core/companies';
import { branches } from '../core/branches';

export const expenseCategories = pgTable(
  'expense_categories',
  {
    ...auditColumns,
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'restrict' }),
    branchId: uuid('branch_id')
      .notNull()
      .references(() => branches.id, { onDelete: 'restrict' }),
    code: varchar('code', { length: 32 }).notNull(),
    name: varchar('name', { length: 128 }).notNull(),
    description: varchar('description', { length: 512 }),
    status: varchar('status', { length: 20 }).notNull().default('active'),
  },
  (t) => [
    uniqueIndex('expense_categories_company_branch_code_unique').on(t.companyId, t.branchId, t.code),
    index('expense_categories_company_id_idx').on(t.companyId),
    index('expense_categories_branch_id_idx').on(t.branchId),
  ],
);
