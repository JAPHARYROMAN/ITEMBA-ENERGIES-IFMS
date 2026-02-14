import { index, jsonb, pgTable, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import { auditColumns } from '../shared';
import { companies } from '../core/companies';
import { branches } from '../core/branches';
import { users } from '../auth/users';

export const APPROVAL_REQUEST_STATUS = {
  draft: 'draft',
  submitted: 'submitted',
  approved: 'approved',
  rejected: 'rejected',
  cancelled: 'cancelled',
} as const;

export type ApprovalRequestStatus = keyof typeof APPROVAL_REQUEST_STATUS;

export const approvalRequests = pgTable(
  'governance_approval_requests',
  {
    ...auditColumns,
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'restrict' }),
    branchId: uuid('branch_id')
      .notNull()
      .references(() => branches.id, { onDelete: 'restrict' }),
    entityType: varchar('entity_type', { length: 64 }).notNull(),
    entityId: uuid('entity_id').notNull(),
    actionType: varchar('action_type', { length: 64 }).notNull(),
    status: varchar('status', { length: 16 }).notNull().default('draft'),
    requestedBy: uuid('requested_by')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    requestedAt: timestamp('requested_at', { withTimezone: true }).notNull().defaultNow(),
    reason: varchar('reason', { length: 1024 }),
    metaJson: jsonb('meta_json').$type<Record<string, unknown>>(),
  },
  (t) => [
    index('gov_approval_requests_scope_idx').on(t.companyId, t.branchId, t.entityType, t.actionType),
    index('gov_approval_requests_status_idx').on(t.status),
    index('gov_approval_requests_entity_idx').on(t.entityType, t.entityId),
  ],
);
