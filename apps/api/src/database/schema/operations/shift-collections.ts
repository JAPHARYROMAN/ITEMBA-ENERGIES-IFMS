import { index, numeric, pgTable, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import { auditColumns } from '../shared';
import { shifts } from './shifts';

export const shiftCollections = pgTable(
  'shift_collections',
  {
    ...auditColumns,
    shiftId: uuid('shift_id')
      .notNull()
      .references(() => shifts.id, { onDelete: 'cascade' }),
    paymentMethod: varchar('payment_method', { length: 32 }).notNull(),
    amount: numeric('amount', { precision: 18, scale: 2 }).notNull(),
  },
  (t) => [
    index('shift_collections_shift_id_idx').on(t.shiftId),
    index('shift_collections_payment_method_idx').on(t.paymentMethod),
  ],
);
