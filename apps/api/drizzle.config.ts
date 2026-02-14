import { config } from 'dotenv';
import { resolve } from 'path';
import { defineConfig } from 'drizzle-kit';

// Load .env from apps/api so db:migrate uses correct DATABASE_URL
config({ path: resolve(__dirname, '.env') });

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error(
    'Missing DATABASE_URL. Copy apps/api/.env.example to apps/api/.env and set DATABASE_URL to your PostgreSQL connection string (e.g. postgresql://postgres:YOUR_PASSWORD@localhost:5432/ifms).',
  );
  process.exit(1);
}

export default defineConfig({
  schema: './src/database/schema/index.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: { url: databaseUrl },
});
