import { Injectable, Inject, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { and, lt, isNotNull, or } from 'drizzle-orm';
import { DRIZZLE } from '../../database/database.module';
import type * as schema from '../../database/schema';
import { refreshTokens } from '../../database/schema/auth';

type Schema = typeof schema;

/**
 * Scheduled cleanup of expired and revoked refresh tokens.
 * Runs nightly at 03:00 UTC. Deletes tokens that are either:
 *   - expired (expiresAt < now), OR
 *   - revoked (revokedAt IS NOT NULL)
 */
@Injectable()
export class TokenCleanupService {
  private readonly logger = new Logger(TokenCleanupService.name);

  constructor(@Inject(DRIZZLE) private readonly db: NodePgDatabase<Schema>) {}

  @Cron('0 3 * * *', { timeZone: process.env.TZ ?? 'UTC' })
  async handleCleanup(): Promise<void> {
    try {
      const result = await this.cleanup();
      this.logger.log(`Token cleanup complete: ${result.deleted} tokens removed`);
    } catch (err) {
      this.logger.error(`Token cleanup failed: ${(err as Error).message}`, (err as Error).stack);
    }
  }

  async cleanup(): Promise<{ deleted: number }> {
    const now = new Date();
    const result = await this.db
      .delete(refreshTokens)
      .where(or(lt(refreshTokens.expiresAt, now), isNotNull(refreshTokens.revokedAt)));

    const deleted = (result as unknown as { rowCount?: number }).rowCount ?? 0;
    return { deleted };
  }
}
