import { index, numeric, pgTable, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import { auditColumns } from '../shared';
import { shifts } from './shifts';
import { nozzles } from '../setup/nozzles';

export const meterReadings = pgTable(
  'meter_readings',
  {
    ...auditColumns,
    shiftId: uuid('shift_id')
      .notNull()
      .references(() => shifts.id, { onDelete: 'cascade' }),
    nozzleId: uuid('nozzle_id')
      .notNull()
      .references(() => nozzles.id, { onDelete: 'restrict' }),
    readingType: varchar('reading_type', { length: 16 }).notNull(),
    value: numeric('value', { precision: 18, scale: 3 }).notNull(),
    pricePerUnit: numeric('price_per_unit', { precision: 18, scale: 2 }),
  },
  (t) => [
    index('meter_readings_shift_id_idx').on(t.shiftId),
    index('meter_readings_nozzle_id_idx').on(t.nozzleId),
    index('meter_readings_reading_type_idx').on(t.readingType),
  ],
);
