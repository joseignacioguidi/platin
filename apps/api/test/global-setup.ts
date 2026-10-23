import { execSync } from 'node:child_process';
import { resolve } from 'node:path';
import { Client } from 'pg';
import { loadTestEnv } from './test-env';

/** Creates the test database if needed and applies every migration. */
export default async function globalSetup(): Promise<void> {
  const url = new URL(loadTestEnv());
  const database = url.pathname.slice(1);

  const admin = new URL(url);
  admin.pathname = '/postgres';
  const client = new Client({ connectionString: admin.toString() });
  await client.connect();
  const exists = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [database]);
  if (exists.rowCount === 0) {
    await client.query(`CREATE DATABASE "${database.replace(/"/g, '')}"`);
  }
  await client.end();

  execSync('pnpm exec prisma migrate deploy', {
    cwd: resolve(import.meta.dirname, '..'),
    env: process.env,
    stdio: 'inherit',
  });
}
