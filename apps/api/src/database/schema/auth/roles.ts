import { pgTable, timestamp, uniqueIndex, uuid, varchar } from 'drizzle-orm/pg-core';
import { auditColumns } from '../shared';

export const roles = pgTable(
  'roles',
  {
    ...auditColumns,
    code: varchar('code', { length: 64 }).notNull(),
    name: varchar('name', { length: 128 }).notNull(),
    description: varchar('description', { length: 512 }),
  },
  (t) => [uniqueIndex('roles_code_unique').on(t.code)],
);
