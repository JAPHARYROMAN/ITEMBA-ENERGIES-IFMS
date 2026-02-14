import { index, numeric, pgTable, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import { auditColumns } from '../shared';
import { deliveries } from './deliveries';

export const grns = pgTable(
  'grns',
  {
    ...auditColumns,
    deliveryId: uuid('delivery_id')
      .notNull()
      .references(() => deliveries.id, { onDelete: 'restrict' }),
    grnNumber: varchar('grn_number', { length: 64 }).notNull(),
    receivedQty: numeric('received_qty', { precision: 18, scale: 3 }).notNull(),
    receivedAt: timestamp('received_at', { withTimezone: true }).notNull(),
    density: numeric('density', { precision: 10, scale: 4 }),
    temperature: numeric('temperature', { precision: 8, scale: 2 }),
    varianceReason: varchar('variance_reason', { length: 512 }),
    status: varchar('status', { length: 20 }).notNull().default('posted'),
  },
  (t) => [
    index('grns_delivery_id_idx').on(t.deliveryId),
    index('grns_created_at_idx').on(t.createdAt),
  ],
);
