import { index, pgTable, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import { auditColumns } from '../shared';
import { shifts } from './shifts';
import { users } from '../auth/users';

export const shiftAssignments = pgTable(
  'shift_assignments',
  {
    ...auditColumns,
    shiftId: uuid('shift_id')
      .notNull()
      .references(() => shifts.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    role: varchar('role', { length: 32 }).notNull(),
  },
  (t) => [
    index('shift_assignments_shift_id_idx').on(t.shiftId),
    index('shift_assignments_user_id_idx').on(t.userId),
  ],
);
