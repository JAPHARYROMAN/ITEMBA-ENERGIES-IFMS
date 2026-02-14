import { Injectable, Inject } from '@nestjs/common';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { DRIZZLE } from '../../database/database.module';
import type * as schema from '../../database/schema';
import { auditLog } from '../../database/schema/audit-log';

type Schema = typeof schema;

export interface AuditEntry {
  entity: string;
  entityId: string;
  action: string;
  before?: object | null;
  after?: object | null;
  userId?: string | null;
  ip?: string | null;
  userAgent?: string | null;
}

@Injectable()
export class AuditService {
  constructor(@Inject(DRIZZLE) private readonly db: NodePgDatabase<Schema>) {}

  /** Log to audit_log. Pass tx to log within the same transaction. */
  async log(entry: AuditEntry, tx?: NodePgDatabase<Schema>): Promise<void> {
    const client = tx ?? this.db;
    await client.insert(auditLog).values({
      entity: entry.entity,
      entityId: entry.entityId,
      action: entry.action,
      beforeJson: entry.before ?? null,
      afterJson: entry.after ?? null,
      actorUserId: entry.userId ?? null,
      ip: entry.ip ?? null,
      userAgent: entry.userAgent ?? null,
    });
  }
}
