import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import path from 'path';

export async function runMigrationsOnStartup(databaseUrl: string): Promise<void> {
  const pool = new Pool({ connectionString: databaseUrl });
  try {
    const db = drizzle(pool);
    await migrate(db, {
      migrationsFolder: path.resolve(process.cwd(), 'drizzle'),
    });
  } finally {
    await pool.end();
  }
}
