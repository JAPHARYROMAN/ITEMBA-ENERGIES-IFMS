import { pgTable, timestamp, varchar } from 'drizzle-orm/pg-core';

export const healthCheck = pgTable('health_check', {
  id: varchar('id', { length: 36 }).primaryKey(),
  status: varchar('status', { length: 20 }).notNull().default('ok'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
