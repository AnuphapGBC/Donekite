import { AppError } from './errors.ts';

export const SESSION_COOKIE = 'donekite_session';

export function sessionToken(request: Request): string | undefined {
  const pairs = (request.headers.get('cookie') ?? '').split(';');
  return pairs.map(pair => pair.trim()).find(pair => pair.startsWith(`${SESSION_COOKIE}=`))?.slice(SESSION_COOKIE.length + 1);
}

export function sessionCookie(token: string, expiresAt: number): string {
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Expires=${new Date(expiresAt).toUTCString()}${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`;
}

export function checkOrigin(request: Request) {
  const origin = request.headers.get('origin');
  const fetchSite = request.headers.get('sec-fetch-site');
  const configured = process.env.DONEKITE_ORIGIN;
  let expected: string;
  try {
    const requestUrl = new URL(request.url);
    expected = configured ? new URL(configured).origin : `${requestUrl.protocol}//${request.headers.get('host') || requestUrl.host}`;
    if (!origin || new URL(origin).origin !== expected || origin === 'null' || fetchSite === 'cross-site') throw new Error();
  } catch { throw new AppError(403, 'This request must come from the DoneKite application.'); }
}

export async function readJson(request: Request, maximum = 16_384): Promise<Record<string, unknown>> {
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) throw new AppError(415, 'Send JSON with the application/json content type.');
  const declaredLength = request.headers.get('content-length');
  if (declaredLength && (!/^\d+$/.test(declaredLength) || Number(declaredLength) > maximum)) throw new AppError(413, 'The request is too large.');
  if (!request.body) throw new AppError(400, 'A JSON request body is required.');
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.byteLength;
    if (length > maximum) { await reader.cancel(); throw new AppError(413, 'The request is too large.'); }
    chunks.push(value);
  }
  try {
    const input: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error();
    return input as Record<string, unknown>;
  } catch { throw new AppError(400, 'The request body must be a JSON object.'); }
}

export function json(data: unknown, status = 200, cookie?: string): Response {
  return Response.json(data, { status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...(cookie ? { 'Set-Cookie': cookie } : {}) } });
}

export async function endpoint(request: Request, action: () => unknown | Promise<unknown>): Promise<Response> {
  try {
    if (!['GET', 'HEAD'].includes(request.method)) checkOrigin(request);
    const result = await action();
    return result instanceof Response ? result : json(result);
  } catch (error) {
    if (error instanceof AppError) return json({ error: error.message, ...error.details }, error.status);
    // Never include database errors, passwords, or tokens in a response or log.
    return json({ error: 'The server could not complete this request. Please try again.' }, 500);
  }
}
