import { pgTable, timestamp, uniqueIndex, uuid, varchar } from 'drizzle-orm/pg-core';
import { auditColumns } from '../shared';

export const users = pgTable(
  'users',
  {
    ...auditColumns,
    email: varchar('email', { length: 255 }).notNull(),
    passwordHash: varchar('password_hash', { length: 255 }).notNull(),
    name: varchar('name', { length: 255 }).notNull(),
    status: varchar('status', { length: 20 }).notNull().default('active'),
  },
  (t) => [uniqueIndex('users_email_unique').on(t.email)],
);
