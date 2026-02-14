import { index, pgTable, timestamp, uniqueIndex, uuid, varchar } from 'drizzle-orm/pg-core';
import { auditColumns } from '../shared';
import { companies } from './companies';

export const stations = pgTable(
  'stations',
  {
    ...auditColumns,
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'restrict' }),
    code: varchar('code', { length: 32 }).notNull(),
    name: varchar('name', { length: 255 }).notNull(),
    location: varchar('location', { length: 512 }),
    manager: varchar('manager', { length: 255 }),
    status: varchar('status', { length: 20 }).notNull().default('active'),
  },
  (t) => [
    uniqueIndex('stations_company_code_unique').on(t.companyId, t.code),
    index('stations_company_id_idx').on(t.companyId),
    index('stations_status_idx').on(t.status),
  ],
);
