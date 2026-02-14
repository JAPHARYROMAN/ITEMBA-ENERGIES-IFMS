import { index, numeric, pgTable, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import { auditColumns } from '../shared';
import { companies } from '../core/companies';
import { branches } from '../core/branches';

export const expenseEntries = pgTable(
  'expense_entries',
  {
    ...auditColumns,
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'restrict' }),
    branchId: uuid('branch_id')
      .notNull()
      .references(() => branches.id, { onDelete: 'restrict' }),
    entryNumber: varchar('entry_number', { length: 64 }).notNull(),
    categoryId: uuid('category_id'),
    category: varchar('category', { length: 64 }).notNull(),
    amount: numeric('amount', { precision: 18, scale: 2 }).notNull(),
    vendor: varchar('vendor', { length: 255 }).notNull(),
    paymentMethod: varchar('payment_method', { length: 32 }).notNull(),
    description: varchar('description', { length: 1024 }),
    billableDepartment: varchar('billable_department', { length: 128 }),
    attachmentName: varchar('attachment_name', { length: 255 }),
    rejectionReason: varchar('rejection_reason', { length: 512 }),
    status: varchar('status', { length: 20 }).notNull().default('draft'),
  },
  (t) => [
    index('expense_entries_company_branch_date_idx').on(t.companyId, t.branchId, t.createdAt),
    index('expense_entries_status_idx').on(t.status),
  ],
);
