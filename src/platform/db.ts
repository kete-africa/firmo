import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { env } from './env';

let pool: pg.Pool | undefined;
let instance: NodePgDatabase | undefined;

/** The application role's pool: it cannot bypass row-level security (constitution III). */
export function getPool(): pg.Pool {
  pool ??= new pg.Pool({ connectionString: env.databaseUrl, max: 10 });
  return pool;
}

/** The database, created on first use. */
export const db = new Proxy({} as NodePgDatabase, {
  get(_target, property) {
    instance ??= drizzle({ client: getPool() });
    const value: unknown = Reflect.get(instance, property);
    return typeof value === 'function'
      ? (value as (...args: unknown[]) => unknown).bind(instance)
      : value;
  },
});

export type Database = NodePgDatabase;
export type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];
