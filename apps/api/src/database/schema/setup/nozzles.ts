import { index, pgTable, timestamp, uniqueIndex, uuid, varchar } from 'drizzle-orm/pg-core';
import { auditColumns } from '../shared';
import { stations } from '../core/stations';
import { pumps } from './pumps';
import { tanks } from './tanks';
import { products } from './products';

export const nozzles = pgTable(
  'nozzles',
  {
    ...auditColumns,
    stationId: uuid('station_id')
      .notNull()
      .references(() => stations.id, { onDelete: 'restrict' }),
    pumpId: uuid('pump_id')
      .notNull()
      .references(() => pumps.id, { onDelete: 'restrict' }),
    tankId: uuid('tank_id')
      .notNull()
      .references(() => tanks.id, { onDelete: 'restrict' }),
    productId: uuid('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'restrict' }),
    code: varchar('code', { length: 32 }).notNull(),
    status: varchar('status', { length: 20 }).notNull().default('active'),
  },
  (t) => [
    uniqueIndex('nozzles_station_code_unique').on(t.stationId, t.code),
    index('nozzles_station_id_idx').on(t.stationId),
    index('nozzles_pump_id_idx').on(t.pumpId),
    index('nozzles_tank_id_idx').on(t.tankId),
    index('nozzles_product_id_idx').on(t.productId),
  ],
);
