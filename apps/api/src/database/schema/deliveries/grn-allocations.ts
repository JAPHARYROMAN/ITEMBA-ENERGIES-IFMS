import { index, numeric, pgTable, timestamp, uuid } from 'drizzle-orm/pg-core';
import { auditColumns } from '../shared';
import { grns } from './grns';
import { tanks } from '../setup/tanks';

export const grnAllocations = pgTable(
  'grn_allocations',
  {
    ...auditColumns,
    grnId: uuid('grn_id')
      .notNull()
      .references(() => grns.id, { onDelete: 'cascade' }),
    tankId: uuid('tank_id')
      .notNull()
      .references(() => tanks.id, { onDelete: 'restrict' }),
    quantity: numeric('quantity', { precision: 18, scale: 3 }).notNull(),
  },
  (t) => [
    index('grn_allocations_grn_id_idx').on(t.grnId),
    index('grn_allocations_tank_id_idx').on(t.tankId),
  ],
);
