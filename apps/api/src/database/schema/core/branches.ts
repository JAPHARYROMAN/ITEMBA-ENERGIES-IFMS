import { index, pgTable, timestamp, uniqueIndex, uuid, varchar } from 'drizzle-orm/pg-core';
import { auditColumns } from '../shared';
import { stations } from './stations';

export const branches = pgTable(
  'branches',
  {
    ...auditColumns,
    stationId: uuid('station_id')
      .notNull()
      .references(() => stations.id, { onDelete: 'restrict' }),
    code: varchar('code', { length: 32 }).notNull(),
    name: varchar('name', { length: 255 }).notNull(),
    status: varchar('status', { length: 20 }).notNull().default('active'),
  },
  (t) => [
    uniqueIndex('branches_station_code_unique').on(t.stationId, t.code),
    index('branches_station_id_idx').on(t.stationId),
    index('branches_status_idx').on(t.status),
  ],
);
