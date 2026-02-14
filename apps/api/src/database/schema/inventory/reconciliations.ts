import { index, numeric, pgTable, text, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import { shifts } from '../operations/shifts';
import { auditColumns } from '../shared';
import { companies } from '../core/companies';
import { branches } from '../core/branches';

export const reconciliations = pgTable(
  'reconciliations',
  {
    ...auditColumns,
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'restrict' }),
    branchId: uuid('branch_id')
      .notNull()
      .references(() => branches.id, { onDelete: 'restrict' }),
    reconciliationDate: timestamp('reconciliation_date', { withTimezone: true }).notNull(),
    shiftId: uuid('shift_id').references(() => shifts.id, { onDelete: 'set null' }),
    expectedVolume: numeric('expected_volume', { precision: 18, scale: 3 }),
    actualVolume: numeric('actual_volume', { precision: 18, scale: 3 }),
    variance: numeric('variance', { precision: 18, scale: 3 }),
    notes: text('notes'),
    status: varchar('status', { length: 20 }).notNull().default('draft'),
  },
  (t) => [
    index('reconciliations_company_branch_date_idx').on(t.companyId, t.branchId, t.reconciliationDate),
    index('reconciliations_reconciliation_date_idx').on(t.reconciliationDate),
    index('reconciliations_status_idx').on(t.status),
  ],
);
