import { pgTable, timestamp, uniqueIndex, uuid, varchar } from 'drizzle-orm/pg-core';
import { auditColumns } from '../shared';

export const permissions = pgTable(
  'permissions',
  {
    ...auditColumns,
    code: varchar('code', { length: 128 }).notNull(),
    name: varchar('name', { length: 255 }).notNull(),
    resource: varchar('resource', { length: 128 }).notNull(),
    action: varchar('action', { length: 32 }).notNull(),
  },
  (t) => [uniqueIndex('permissions_code_unique').on(t.code)],
);
