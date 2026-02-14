import { index, integer, pgTable, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import { auditColumns } from '../shared';
import { users } from '../auth/users';
import { approvalRequests } from './approval-requests';

export const APPROVAL_STEP_STATUS = {
  pending: 'pending',
  approved: 'approved',
  rejected: 'rejected',
  skipped: 'skipped',
} as const;

export type ApprovalStepStatus = keyof typeof APPROVAL_STEP_STATUS;

export const approvalSteps = pgTable(
  'governance_approval_steps',
  {
    ...auditColumns,
    approvalRequestId: uuid('approval_request_id')
      .notNull()
      .references(() => approvalRequests.id, { onDelete: 'cascade' }),
    stepOrder: integer('step_order').notNull(),
    requiredRole: varchar('required_role', { length: 64 }),
    requiredPermission: varchar('required_permission', { length: 128 }),
    status: varchar('status', { length: 16 }).notNull().default('pending'),
    decidedBy: uuid('decided_by').references(() => users.id, { onDelete: 'restrict' }),
    decidedAt: timestamp('decided_at', { withTimezone: true }),
    decisionReason: varchar('decision_reason', { length: 1024 }),
  },
  (t) => [
    index('gov_approval_steps_request_order_idx').on(t.approvalRequestId, t.stepOrder),
    index('gov_approval_steps_status_idx').on(t.status),
  ],
);
