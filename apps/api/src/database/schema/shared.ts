import type { PgTableWithColumns } from 'drizzle-orm/pg-core';
import { timestamp, uuid, varchar } from 'drizzle-orm/pg-core';

/** Audit columns added to every entity table */
export const auditColumns = {
  id: uuid('id').primaryKey().defaultRandom(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  createdBy: uuid('created_by'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  updatedBy: uuid('updated_by'),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
};

/** Company/branch scope for reporting and RBAC */
export const scopeColumns = {
  companyId: uuid('company_id').notNull(),
  branchId: uuid('branch_id').notNull(),
};

export type AuditColumns = typeof auditColumns;
export type ScopeColumns = typeof scopeColumns;
