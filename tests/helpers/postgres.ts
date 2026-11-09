import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import type { Database, SqlClient } from '../../lib/server/database.ts';

// Run the production SQL against PostgreSQL itself, isolated from DATABASE_URL.
export async function createTestDatabase(dataDir?: string): Promise<Database & { migrate(): Promise<void> }> {
  const engine = await PGlite.create(dataDir);
  const migration = await readFile(new URL('../../db/migrations/0001_initial.sql', import.meta.url), 'utf8');
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
    async migrate() { await engine.exec(migration); },
  };
  await database.migrate();
  return database;
}
