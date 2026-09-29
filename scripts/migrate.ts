/**
 * Applies pending migrations with the owner role: FIRMO_OWNER_URL, or the named Neon branch's
 * owner URL from .env (`pnpm db:migrate test` reads FIRMO_TEST_OWNER_URL).
 */
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { existsSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';
import pg from 'pg';

const localEnv = fileURLToPath(new URL('../.env', import.meta.url));
if (existsSync(localEnv)) process.loadEnvFile(localEnv);

const branch = process.argv[2]?.toUpperCase();
const name = branch ? `FIRMO_${branch}_OWNER_URL` : 'FIRMO_OWNER_URL';
const url = process.env[name];
if (!url) throw new Error(`${name} is not set.`);
const pool = new pg.Pool({ connectionString: url, max: 1 });
await migrate(drizzle({ client: pool }), {
  migrationsFolder: fileURLToPath(new URL('../db/migrations', import.meta.url)),
});
await pool.end();
console.log('Migrations applied.');
