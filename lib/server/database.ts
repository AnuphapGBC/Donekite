import { Pool } from 'pg';

export type SqlResult<T> = { rows: T[]; rowCount?: number | null };
export interface SqlClient {
  query<T = Record<string, unknown>>(text: string, values?: unknown[]): Promise<SqlResult<T>>;
}
export interface Database extends SqlClient {
  transaction<T>(work: (client: SqlClient) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

export function createPostgresDatabase(connectionString = process.env.DATABASE_URL): Database {
  if (!connectionString) throw new Error('DATABASE_URL is required. Configure the server environment before starting DoneKite.');
  let url: URL;
  try { url = new URL(connectionString); }
  catch { throw new Error('DATABASE_URL must be a valid PostgreSQL connection URL.'); }
  if (!['postgres:', 'postgresql:'].includes(url.protocol)) throw new Error('DATABASE_URL must use PostgreSQL.');
  const local = ['localhost', '127.0.0.1', '[::1]', '::1'].includes(url.hostname);
  const disableTls = url.searchParams.get('sslmode') === 'disable';
  if (disableTls && !local) throw new Error('TLS cannot be disabled for a remote database.');
  // pg's URL SSL options otherwise replace the explicit certificate-verification config.
  for (const option of ['sslmode', 'sslcert', 'sslkey', 'sslrootcert', 'channel_binding']) url.searchParams.delete(option);
  const pool = new Pool({
    connectionString: url.toString(),
    ssl: disableTls ? false : { rejectUnauthorized: true },
    enableChannelBinding: true,
    max: 5,
    connectionTimeoutMillis: 10_000,
    idleTimeoutMillis: 30_000,
    query_timeout: 20_000,
    allowExitOnIdle: true,
  });
  // A disconnected idle client must not become an unhandled EventEmitter error.
  pool.on('error', () => { console.error('A PostgreSQL pool connection was interrupted.'); });
  return {
    async query<T>(text: string, values?: unknown[]) {
      const response = await pool.query(text, values);
      const result = Array.isArray(response) ? response.at(-1) : response;
      return { rows: (result?.rows ?? []) as T[], rowCount: result?.rowCount };
    },
    async transaction<T>(work: (client: SqlClient) => Promise<T>) {
      const client = await pool.connect();
      let discard = false;
      try {
        await client.query('BEGIN');
        const result = await work({
          async query<R>(text: string, values?: unknown[]) {
            const response = await client.query(text, values);
            const result = Array.isArray(response) ? response.at(-1) : response;
            return { rows: (result?.rows ?? []) as R[], rowCount: result?.rowCount };
          },
        });
        await client.query('COMMIT');
        return result;
      } catch (error) {
        try { await client.query('ROLLBACK'); } catch { discard = true; }
        throw error;
      } finally { client.release(discard); }
    },
    close: () => pool.end(),
  };
}
