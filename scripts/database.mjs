import { createHash } from 'node:crypto';
import { loadEnvFile } from 'node:process';
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createPostgresDatabase } from '../lib/server/database.ts';

const command = process.argv[2];
if (!['check', 'migrate'].includes(command)) throw new Error('Use database.mjs check or migrate.');

for (const name of ['.env.local', '.env']) {
  try { loadEnvFile(fileURLToPath(new URL(`../${name}`, import.meta.url))); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
}

const connectionString = (command === 'migrate' && process.env.DATABASE_URL_UNPOOLED) || process.env.DATABASE_URL;
if (!connectionString) throw new Error('Set DATABASE_URL in .env.local or the server environment first.');

const database = createPostgresDatabase(connectionString);
try {
  if (command === 'check') {
    const result = await database.query("SELECT to_regclass('donekite.users') IS NOT NULL AS schema_ready");
    console.log(JSON.stringify({ connected: true, ...result.rows[0] }));
  } else {
    const directory = new URL('../db/migrations/', import.meta.url);
    const files = (await readdir(directory)).filter(name => /^\d+_[a-z0-9_]+\.sql$/.test(name)).sort();
    const applied = [];
    await database.transaction(async client => {
      // Transaction-scoped locking also works through Neon pooling.
      await client.query('SELECT pg_advisory_xact_lock($1)', [614294810]);
      await client.query('CREATE SCHEMA IF NOT EXISTS donekite');
      await client.query(`CREATE TABLE IF NOT EXISTS donekite.schema_migrations (
        name TEXT PRIMARY KEY, checksum TEXT NOT NULL, applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )`);
      for (const name of files) {
        const sql = (await readFile(new URL(name, directory), 'utf8')).replaceAll('\r\n', '\n');
        const checksum = createHash('sha256').update(sql).digest('hex');
        const existing = await client.query('SELECT checksum FROM donekite.schema_migrations WHERE name = $1', [name]);
        if (existing.rows.length) {
          if (existing.rows[0].checksum !== checksum) throw new Error('MIGRATION_CHECKSUM');
          continue;
        }
        await client.query(sql);
        await client.query('INSERT INTO donekite.schema_migrations(name, checksum) VALUES ($1, $2)', [name, checksum]);
        applied.push(name);
      }
    });
    console.log(applied.length ? `Applied migrations: ${applied.join(', ')}` : 'Database schema is up to date.');
  }
} catch (error) {
  // Connection errors may include credentials or SQL details; keep CLI output safe.
  const code = typeof error.code === 'string' && /^[A-Z0-9_]+$/.test(error.code) ? error.code : 'CHECK_CONFIGURATION';
  console.error(`Database ${command} failed (${code}). Check connectivity, permissions, and environment configuration.`);
  process.exitCode = 1;
} finally { await database.close(); }
