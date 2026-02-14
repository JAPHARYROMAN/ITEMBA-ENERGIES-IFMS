import { index, pgTable, timestamp, uniqueIndex, uuid, varchar } from 'drizzle-orm/pg-core';
import { auditColumns } from '../shared';

export const companies = pgTable(
  'companies',
  {
    ...auditColumns,
    code: varchar('code', { length: 32 }).notNull(),
    name: varchar('name', { length: 255 }).notNull(),
    status: varchar('status', { length: 20 }).notNull().default('active'),
  },
  (t) => [
    uniqueIndex('companies_code_unique').on(t.code),
    index('companies_status_idx').on(t.status),
  ],
);
