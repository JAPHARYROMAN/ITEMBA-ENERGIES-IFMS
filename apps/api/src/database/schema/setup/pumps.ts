import { index, pgTable, timestamp, uniqueIndex, uuid, varchar } from 'drizzle-orm/pg-core';
import { auditColumns } from '../shared';
import { stations } from '../core/stations';

export const pumps = pgTable(
  'pumps',
  {
    ...auditColumns,
    stationId: uuid('station_id')
      .notNull()
      .references(() => stations.id, { onDelete: 'restrict' }),
    code: varchar('code', { length: 32 }).notNull(),
    name: varchar('name', { length: 128 }),
    status: varchar('status', { length: 20 }).notNull().default('active'),
  },
  (t) => [
    uniqueIndex('pumps_station_code_unique').on(t.stationId, t.code),
    index('pumps_station_id_idx').on(t.stationId),
  ],
);
