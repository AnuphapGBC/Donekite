import { readFile, readdir } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import type { Database, SqlClient } from '../../lib/server/database.ts';

// Run the production SQL against PostgreSQL itself, isolated from DATABASE_URL.
export async function createTestDatabase(dataDir?: string): Promise<Database & { migrate(): Promise<void> }> {
  const engine = await PGlite.create(dataDir);
  const directory = new URL('../../db/migrations/', import.meta.url);
  const migrations = await Promise.all((await readdir(directory))
    .filter(name => /^\d+_[a-z0-9_]+\.sql$/.test(name)).sort()
    .map(name => readFile(new URL(name, directory), 'utf8')));
  const adapt = (client: Pick<PGlite, 'query'>): SqlClient => ({
    async query<T = Record<string, unknown>>(text: string, values?: unknown[]) {
      const result = await client.query<T>(text, values);
      return { rows: result.rows, rowCount: result.affectedRows ?? result.rows.length };
    },
  });
  const database = {
    ...adapt(engine),
    transaction<T>(work: (client: SqlClient) => Promise<T>) {
      return engine.transaction(transaction => work(adapt(transaction)));
    },
    close: () => engine.close(),
    async migrate() { for (const migration of migrations) await engine.exec(migration); },
  };
  await database.migrate();
  return database;
}
