import "server-only";
import { Pool, type PoolClient, type QueryResultRow } from "pg";
import { validateRuntimeConfig } from "@/lib/config";

let pool: Pool | undefined;

export function getPool(): Pool {
  validateRuntimeConfig();
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not configured");
  if (!pool) {
    const configuredMax = Number.parseInt(process.env.DATABASE_POOL_MAX || (process.env.VERCEL ? "2" : "10"), 10);
    pool = new Pool({
      connectionString,
      max: Number.isFinite(configuredMax) ? Math.max(1, Math.min(configuredMax, 50)) : 2,
      idleTimeoutMillis: 20_000,
      connectionTimeoutMillis: 8_000,
      allowExitOnIdle: true
    });
    pool.on("error", (error) => {
      console.error(JSON.stringify({ event: "database_pool_error", errorType: error.name, message: error.message }));
    });
  }
  return pool;
}

export async function query<T extends QueryResultRow>(text: string, values: unknown[] = []): Promise<T[]> {
  const result = await getPool().query<T>(text, values);
  return result.rows;
}

export async function withTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const value = await fn(client);
    await client.query("COMMIT");
    return value;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
