import { index, numeric, pgTable, text, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import { auditColumns } from '../shared';
import { companies } from '../core/companies';
import { branches } from '../core/branches';
import { tanks } from '../setup/tanks';
import { approvalRequests } from '../governance/approval-requests';

export const adjustments = pgTable(
  'adjustments',
  {
    ...auditColumns,
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'restrict' }),
    branchId: uuid('branch_id')
      .notNull()
      .references(() => branches.id, { onDelete: 'restrict' }),
    tankId: uuid('tank_id')
      .notNull()
      .references(() => tanks.id, { onDelete: 'restrict' }),
    adjustmentDate: timestamp('adjustment_date', { withTimezone: true }).notNull(),
    volumeDelta: numeric('volume_delta', { precision: 18, scale: 3 }).notNull(),
    reason: varchar('reason', { length: 64 }).notNull(),
    notes: text('notes'),
    status: varchar('status', { length: 20 }).notNull().default('completed'),
    approvalRequestId: uuid('approval_request_id').references(() => approvalRequests.id, { onDelete: 'set null' }),
  },
  (t) => [
    index('adjustments_company_branch_date_idx').on(t.companyId, t.branchId, t.adjustmentDate),
    index('adjustments_tank_id_idx').on(t.tankId),
    index('adjustments_status_idx').on(t.status),
  ],
);
