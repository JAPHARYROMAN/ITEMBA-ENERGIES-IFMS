import { Inject, Injectable } from '@nestjs/common';
import { DRIZZLE } from '../../database/database.module';
import { sql } from 'drizzle-orm';

@Injectable()
export class SystemRepository {
  constructor(@Inject(DRIZZLE) private readonly db: unknown) {}

  async isDatabaseReady(): Promise<boolean> {
    try {
      await (this.db as { execute: (q: ReturnType<typeof sql>) => Promise<unknown> }).execute(sql`SELECT 1`);
      return true;
    } catch {
      return false;
    }
  }
}
