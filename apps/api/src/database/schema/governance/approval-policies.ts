import { boolean, index, jsonb, numeric, pgTable, uuid, varchar } from 'drizzle-orm/pg-core';
import { auditColumns } from '../shared';
import { companies } from '../core/companies';
import { branches } from '../core/branches';

export interface ApprovalPolicyStep {
  stepOrder: number;
  requiredRole?: string;
  requiredPermission?: string;
  dueHours?: number;
  allowSelfApproval?: boolean;
}

export const approvalPolicies = pgTable(
  'governance_policies',
  {
    ...auditColumns,
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'restrict' }),
    branchId: uuid('branch_id').references(() => branches.id, { onDelete: 'restrict' }),
    entityType: varchar('entity_type', { length: 64 }).notNull(),
    actionType: varchar('action_type', { length: 64 }).notNull(),
    thresholdAmount: numeric('threshold_amount', { precision: 18, scale: 2 }),
    thresholdPct: numeric('threshold_pct', { precision: 10, scale: 4 }),
    approvalStepsJson: jsonb('approval_steps_json').$type<ApprovalPolicyStep[]>().notNull(),
    isEnabled: boolean('is_enabled').notNull().default(true),
  },
  (t) => [
    index('gov_policies_company_branch_entity_action_idx').on(t.companyId, t.branchId, t.entityType, t.actionType),
    index('gov_policies_enabled_idx').on(t.isEnabled),
  ],
);
