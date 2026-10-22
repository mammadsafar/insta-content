import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import pg from 'pg';

export async function migrate(): Promise<string[]> {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  const applied: string[] = [];
  try {
    // Session-level locking prevents concurrent containers from racing at first boot.
    await client.query('SELECT pg_advisory_lock(727001)');
    await client.query('CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())');
    const directory = resolve('db/migrations');
    for (const name of (await readdir(directory)).filter((entry) => /^\d+_[a-z0-9_-]+\.sql$/i.test(entry)).sort()) {
      if ((await client.query('SELECT 1 FROM schema_migrations WHERE name=$1', [name])).rowCount) continue;
      const sql = await readFile(resolve(directory, name), 'utf8');
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations(name) VALUES($1)', [name]);
        await client.query('COMMIT');
        applied.push(name);
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
    }
    return applied;
  } finally {
    await client.query('SELECT pg_advisory_unlock(727001)').catch(() => undefined);
    await client.end();
  }
}

if (process.argv[1]?.endsWith('/migrate.js') || process.argv[1]?.endsWith('/migrate.ts')) {
  migrate().then((names) => console.log(names.length ? `Applied migrations: ${names.join(', ')}` : 'Database is up to date.')).catch((error: unknown) => {
    console.error('Migration failed:', error instanceof Error ? error.message : 'Unknown database error');
    process.exitCode = 1;
  });
}
