/**
 * Reset admin password to Admin123!
 * Run: npm run db:reset-admin (from apps/api)
 * Use when seed was skipped (DB already had GEC) or password doesn't work.
 */
import { config } from 'dotenv';
import { resolve } from 'path';
import * as bcrypt from 'bcrypt';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { eq } from 'drizzle-orm';
import { users } from './schema';

config({ path: resolve(__dirname, '../../.env') });

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('Missing DATABASE_URL in apps/api/.env');
  process.exit(1);
}

const ADMIN_EMAIL = 'admin@ifms.com';
const ADMIN_PASSWORD = 'Admin123!';

async function resetAdmin() {
  const pool = new Pool({ connectionString: DATABASE_URL });
  const db = drizzle(pool);

  const [user] = await db
    .select({ id: users.id, email: users.email })
    .from(users)
    .where(eq(users.email, ADMIN_EMAIL));

  if (!user) {
    console.error(`No user found with email "${ADMIN_EMAIL}". Run db:seed on a fresh database first.`);
    await pool.end();
    process.exit(1);
  }

  const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 10);
  await db.update(users).set({ passwordHash, updatedAt: new Date() }).where(eq(users.id, user.id));
  console.log(`Password reset for ${ADMIN_EMAIL}. You can now log in with: ${ADMIN_EMAIL} / ${ADMIN_PASSWORD}`);
  await pool.end();
}

resetAdmin().catch((err) => {
  console.error('Reset failed:', err);
  process.exit(1);
});
