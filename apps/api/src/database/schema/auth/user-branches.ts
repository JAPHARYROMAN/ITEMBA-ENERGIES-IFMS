import { pgTable, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { auditColumns } from '../shared';
import { users } from './users';
import { branches } from '../core/branches';

/** Junction table mapping users to the branches they are allowed to access */
export const userBranches = pgTable(
  'user_branches',
  {
    ...auditColumns,
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    branchId: uuid('branch_id')
      .notNull()
      .references(() => branches.id, { onDelete: 'cascade' }),
  },
  (t) => [
    uniqueIndex('user_branches_user_branch_unique').on(t.userId, t.branchId),
  ],
);
