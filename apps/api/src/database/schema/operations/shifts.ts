import { index, numeric, pgTable, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import { auditColumns } from '../shared';
import { stations } from '../core/stations';
import { branches } from '../core/branches';
import { companies } from '../core/companies';
import { users } from '../auth/users';

export const SHIFT_STATUS_OPEN = 'open';
export const SHIFT_STATUS_CLOSED = 'closed';
export const SHIFT_STATUS_PENDING_APPROVAL = 'pending_approval';
export const SHIFT_STATUS_APPROVED = 'approved';

export const shifts = pgTable(
  'shifts',
  {
    ...auditColumns,
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'restrict' }),
    branchId: uuid('branch_id')
      .notNull()
      .references(() => branches.id, { onDelete: 'restrict' }),
    stationId: uuid('station_id')
      .notNull()
      .references(() => stations.id, { onDelete: 'restrict' }),
    code: varchar('code', { length: 32 }).notNull(),
    type: varchar('type', { length: 20 }).notNull(),
    startTime: timestamp('start_time', { withTimezone: true }).notNull(),
    endTime: timestamp('end_time', { withTimezone: true }),
    status: varchar('status', { length: 32 }).notNull().default(SHIFT_STATUS_OPEN),
    openedBy: uuid('opened_by').references(() => users.id),
    closedBy: uuid('closed_by').references(() => users.id),
    totalExpectedAmount: numeric('total_expected_amount', { precision: 18, scale: 2 }),
    totalCollectedAmount: numeric('total_collected_amount', { precision: 18, scale: 2 }),
    varianceAmount: numeric('variance_amount', { precision: 18, scale: 2 }),
    varianceReason: varchar('variance_reason', { length: 512 }),
    submittedForApprovalAt: timestamp('submitted_for_approval_at', { withTimezone: true }),
    approvedAt: timestamp('approved_at', { withTimezone: true }),
    approvedBy: uuid('approved_by').references(() => users.id),
  },
  (t) => [
    index('shifts_company_id_branch_id_idx').on(t.companyId, t.branchId),
    index('shifts_branch_id_status_idx').on(t.branchId, t.status),
    index('shifts_station_id_idx').on(t.stationId),
    index('shifts_status_idx').on(t.status),
    index('shifts_start_time_idx').on(t.startTime),
  ],
);
