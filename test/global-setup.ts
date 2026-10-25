import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse } from 'dotenv';
import { assertTestDatabase } from './db-guard';

// Runs once before the whole suite: applies migrations to the *test* database only.
export default function globalSetup() {
  const env = parse(readFileSync(resolve(process.cwd(), '.env.test')));
  assertTestDatabase(env.DATABASE_URL);

  execSync('npx prisma migrate deploy', {
    stdio: 'inherit',
    env: { ...process.env, ...env },
  });
}
