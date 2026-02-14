import { pgTable, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { auditColumns } from '../shared';
import { roles } from './roles';
import { permissions } from './permissions';

export const rolePermissions = pgTable(
  'role_permissions',
  {
    ...auditColumns,
    roleId: uuid('role_id')
      .notNull()
      .references(() => roles.id, { onDelete: 'cascade' }),
    permissionId: uuid('permission_id')
      .notNull()
      .references(() => permissions.id, { onDelete: 'cascade' }),
  },
  (t) => [uniqueIndex('role_permissions_role_perm_unique').on(t.roleId, t.permissionId)],
);
