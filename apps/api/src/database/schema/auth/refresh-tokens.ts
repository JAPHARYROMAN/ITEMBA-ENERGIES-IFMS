import { index, pgTable, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import { auditColumns } from '../shared';
import { users } from './users';

export const refreshTokens = pgTable(
  'refresh_tokens',
  {
    ...auditColumns,
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    token: varchar('token', { length: 512 }).notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
  },
  (t) => [
    index('refresh_tokens_user_id_idx').on(t.userId),
    index('refresh_tokens_expires_at_idx').on(t.expiresAt),
  ],
);
