// Creates the test database if needed and applies all migrations to it. Runs before `npm test`.
import { spawnSync } from 'node:child_process';

import pg from 'pg';

import './setup.js';

const testUrl = new URL(process.env['DATABASE_URL']!);
const dbName = testUrl.pathname.slice(1);

const adminUrl = new URL(testUrl);
adminUrl.pathname = '/postgres';
adminUrl.search = '';
const admin = new pg.Client({ connectionString: adminUrl.toString() });
await admin.connect();
const { rowCount } = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [dbName]);
if (!rowCount) {
  await admin.query(`CREATE DATABASE "${dbName.replace(/"/g, '""')}"`);
  console.log(`Created database ${dbName}`);
}
await admin.end();

const result = spawnSync('npx', ['prisma', 'migrate', 'deploy'], {
  stdio: 'inherit',
  shell: process.platform === 'win32',
  env: process.env,
});
process.exit(result.status ?? 1);
