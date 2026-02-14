import { index, numeric, pgTable, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import { auditColumns } from '../shared';
import { companies } from '../core/companies';
import { branches } from '../core/branches';

export const pettyCashLedger = pgTable(
  'petty_cash_ledger',
  {
    ...auditColumns,
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'restrict' }),
    branchId: uuid('branch_id')
      .notNull()
      .references(() => branches.id, { onDelete: 'restrict' }),
    transactionType: varchar('transaction_type', { length: 16 }).notNull(),
    amount: numeric('amount', { precision: 18, scale: 2 }).notNull(),
    category: varchar('category', { length: 64 }),
    notes: varchar('notes', { length: 512 }).notNull(),
    balanceAfter: numeric('balance_after', { precision: 18, scale: 2 }).notNull(),
  },
  (t) => [
    index('petty_cash_ledger_company_branch_date_idx').on(t.companyId, t.branchId, t.createdAt),
    index('petty_cash_ledger_transaction_type_idx').on(t.transactionType),
  ],
);
