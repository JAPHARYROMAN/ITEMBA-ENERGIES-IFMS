import { Global, Module } from '@nestjs/common';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { ConfigService } from '@nestjs/config';
import * as schema from './schema';

export const DRIZZLE = 'DRIZZLE';
export const PG_POOL = 'PG_POOL';

@Global()
@Module({
  providers: [
    {
      provide: PG_POOL,
      useFactory: (configService: ConfigService) => {
        const connectionString = configService.get<string>('DATABASE_URL');
        const dbSsl = configService.get<string>('DB_SSL', 'false');
        let ssl: boolean | { rejectUnauthorized: boolean } = false;
        if (dbSsl === 'require' || dbSsl === 'true') {
          ssl = { rejectUnauthorized: true };
        } else if (dbSsl === 'no-verify') {
          ssl = { rejectUnauthorized: false };
        }
        return new Pool({
          connectionString,
          ssl,
          max: configService.get<number>('DB_POOL_MAX', 20),
          idleTimeoutMillis: configService.get<number>('DB_POOL_IDLE_TIMEOUT', 30_000),
          connectionTimeoutMillis: configService.get<number>('DB_POOL_CONN_TIMEOUT', 5_000),
          statement_timeout: configService.get<number>('DB_STATEMENT_TIMEOUT', 30_000),
        });
      },
      inject: [ConfigService],
    },
    {
      provide: DRIZZLE,
      useFactory: (pool: Pool) => drizzle(pool, { schema }),
      inject: [PG_POOL],
    },
  ],
  exports: [DRIZZLE, PG_POOL],
})
export class DatabaseModule {}
