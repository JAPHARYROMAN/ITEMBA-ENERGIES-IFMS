import { pgTable, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { auditColumns } from '../shared';
import { users } from './users';
import { roles } from './roles';

export const userRoles = pgTable(
  'user_roles',
  {
    ...auditColumns,
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    roleId: uuid('role_id')
      .notNull()
      .references(() => roles.id, { onDelete: 'cascade' }),
  },
  (t) => [uniqueIndex('user_roles_user_role_unique').on(t.userId, t.roleId)],
);
