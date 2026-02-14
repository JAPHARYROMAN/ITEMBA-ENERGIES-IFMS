import { index, jsonb, pgTable, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import { users } from '../auth/users';
import { approvalRequests } from './approval-requests';

export const approvalsAudit = pgTable(
  'governance_approvals_audit',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    approvalRequestId: uuid('approval_request_id')
      .notNull()
      .references(() => approvalRequests.id, { onDelete: 'cascade' }),
    eventType: varchar('event_type', { length: 64 }).notNull(),
    actorUserId: uuid('actor_user_id').references(() => users.id, { onDelete: 'restrict' }),
    payloadJson: jsonb('payload_json').$type<Record<string, unknown>>(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('gov_approvals_audit_request_idx').on(t.approvalRequestId, t.createdAt),
    index('gov_approvals_audit_event_idx').on(t.eventType),
  ],
);
