import { index, jsonb, pgTable, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';

export const auditLog = pgTable(
  'audit_log',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    entity: varchar('entity', { length: 128 }).notNull(),
    entityId: uuid('entity_id').notNull(),
    action: varchar('action', { length: 32 }).notNull(),
    beforeJson: jsonb('before_json'),
    afterJson: jsonb('after_json'),
    actorUserId: uuid('actor_user_id'),
    ip: varchar('ip', { length: 45 }),
    userAgent: varchar('user_agent', { length: 512 }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('audit_log_entity_entity_id_idx').on(t.entity, t.entityId),
    index('audit_log_actor_user_id_idx').on(t.actorUserId),
    index('audit_log_created_at_idx').on(t.createdAt),
  ],
);
