import pg, { type PoolClient, type QueryResultRow } from 'pg';

// A calendar date is not an instant. Preserve DATE and TIME as strings.
pg.types.setTypeParser(1082, (value) => value);
pg.types.setTypeParser(1083, (value) => value);

export const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  max: Number(process.env.DATABASE_POOL_SIZE || 10),
  connectionTimeoutMillis: 10_000,
  idleTimeoutMillis: 30_000,
});
pool.on('error', (error) => console.error('Database connection error', error.code));

export async function query<T extends QueryResultRow = any>(text: string, values: any[] = []): Promise<T[]> {
  return (await pool.query<T>(text, values)).rows;
}
export async function one<T extends QueryResultRow = any>(text: string, values: any[] = []): Promise<T | undefined> {
  return (await query<T>(text, values))[0];
}
export async function transaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
