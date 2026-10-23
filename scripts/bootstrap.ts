import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import pg from 'pg';
import { hashPassword } from '../server/core/security.js';

async function hiddenPassword(): Promise<string> {
  if (!stdin.isTTY || !stdin.setRawMode) throw new Error('Interactive terminal required; use --password-stdin for a secret supplied through standard input.');
  stdout.write('Owner password (at least 12 characters): ');
  stdin.setRawMode(true);
  stdin.resume();
  stdin.setEncoding('utf8');
  try {
    return await new Promise<string>((resolve, reject) => {
      let value = '';
      const onData = (chunk: string) => {
        for (const char of chunk) {
          if (char === '\u0003') { cleanup(); reject(new Error('Bootstrap cancelled')); return; }
          if (char === '\r' || char === '\n') { cleanup(); resolve(value); return; }
          if (char === '\u007f' || char === '\b') value = value.slice(0, -1);
          else if (char >= ' ') value += char;
        }
      };
      const cleanup = () => { stdin.removeListener('data', onData); };
      stdin.on('data', onData);
    });
  } finally {
    stdin.setRawMode(false);
    stdin.pause();
    stdout.write('\n');
  }
}

async function passwordFromStdin(): Promise<string> {
  let value = '';
  for await (const chunk of stdin) {
    value += chunk.toString();
    if (value.length > 1024) throw new Error('Password input exceeds maximum size');
  }
  return value.replace(/\r?\n$/, '');
}

export async function bootstrapOwner(input: { name: string; email: string; password: string; pageNames?: [string, string] }): Promise<void> {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
  if (!input.name.trim() || input.name.length > 120) throw new Error('Owner name must contain 1–120 characters');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email) || input.email.length > 254) throw new Error('A valid owner email is required');
  if (input.password.length < 12 || input.password.length > 256) throw new Error('Owner password must contain 12–256 characters');
  const pageNames = input.pageNames ?? ['صفحه داروساز', 'صفحه فیشیال و مراقبت پوست'];
  if (pageNames.some((name) => !name.trim() || name.length > 120)) throw new Error('Page names must contain 1–120 characters');
  const passwordHash = await hashPassword(input.password);
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(727002)');
    if ((await client.query("SELECT 1 FROM users WHERE role='owner'")).rowCount) throw new Error('An owner already exists. Bootstrap does not change existing credentials.');
    if ((await client.query('SELECT 1 FROM pages LIMIT 1')).rowCount) throw new Error('Pages already exist. Bootstrap requires a fresh migrated database.');
    const owner = await client.query("INSERT INTO users(name,email,password_hash,role) VALUES($1,$2,$3,'owner') RETURNING id", [input.name.trim(), input.email.trim().toLowerCase(), passwordHash]);
    for (const name of pageNames) {
      const page = await client.query('INSERT INTO pages(name,reminder_user_id) VALUES($1,$2) RETURNING id', [name.trim(), owner.rows[0].id]);
      await client.query("INSERT INTO schedule_rules(page_id,effective_date,posts_per_day,times) VALUES($1,'1970-01-01',2,'[]')", [page.rows[0].id]);
    }
    await client.query("INSERT INTO audit_logs(actor_id,action,target_type,target_id,detail) VALUES($1::uuid,'owner.bootstrap','user',$1::text,'{}')", [owner.rows[0].id]);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    await client.end();
  }
}

async function main(): Promise<void> {
  const allowed = new Set(['--password-stdin']);
  if (process.argv.slice(2).some((arg) => !allowed.has(arg))) throw new Error('Only --password-stdin is accepted. Never pass passwords as arguments.');
  const passwordStdin = process.argv.includes('--password-stdin');
  let name = process.env.OWNER_NAME ?? '';
  let email = process.env.OWNER_EMAIL ?? '';
  if (!name || !email) {
    if (passwordStdin) throw new Error('OWNER_NAME and OWNER_EMAIL are required with --password-stdin');
    const prompt = createInterface({ input: stdin, output: stdout });
    try {
      name ||= await prompt.question('Owner name: ');
      email ||= await prompt.question('Owner email: ');
    } finally { prompt.close(); }
  }
  const password = passwordStdin ? await passwordFromStdin() : await hiddenPassword();
  await bootstrapOwner({ name, email, password, pageNames: [process.env.PAGE_ONE_NAME ?? 'صفحه داروساز', process.env.PAGE_TWO_NAME ?? 'صفحه فیشیال و مراقبت پوست'] });
  console.log('Owner and two empty configurable pages created. No demo content or metrics were inserted.');
}

if (process.argv[1]?.endsWith('/bootstrap.js') || process.argv[1]?.endsWith('/bootstrap.ts')) {
  main().catch((error: unknown) => {
    console.error('Bootstrap failed:', error instanceof Error ? error.message : 'Unknown database error');
    process.exitCode = 1;
  });
}
