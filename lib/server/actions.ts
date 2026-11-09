import { AppError } from './errors.ts';
import { endpoint, json, readJson, sessionCookie, sessionToken } from './http.ts';
import { getStore } from './store.ts';

let activePasswordRequests = 0;
async function withPasswordLimit<T>(action: () => Promise<T>): Promise<T> {
  if (activePasswordRequests >= 4) throw new AppError(429, 'The server is busy. Please try again shortly.');
  activePasswordRequests++;
  try { return await action(); } finally { activePasswordRequests--; }
}

export function register(request: Request) {
  return endpoint(request, async () => {
    const input = await readJson(request);
    const session = await withPasswordLimit(() => getStore().register(input));
    return json(await getStore().readWorkspace(session.token), 201, sessionCookie(session.token, session.expiresAt));
  });
}

export function login(request: Request) {
  return endpoint(request, async () => {
    const input = await readJson(request);
    const session = await withPasswordLimit(() => getStore().login(input));
    return json(await getStore().readWorkspace(session.token), 200, sessionCookie(session.token, session.expiresAt));
  });
}

export function logout(request: Request) {
  return endpoint(request, async () => {
    await getStore().logout(sessionToken(request));
    return json({ ok: true }, 200, sessionCookie('', 0));
  });
}

export function session(request: Request) {
  return endpoint(request, () => getStore().readWorkspace(sessionToken(request)));
}

export function getWorkspace(request: Request) {
  return endpoint(request, async () => {
    const { state, revision, workspace } = await getStore().readWorkspace(sessionToken(request));
    if (new URL(request.url).searchParams.get('workspaceId') !== workspace.id) throw new AppError(409, 'Your active workspace changed. Reload to continue.');
    return { state, revision };
  });
}

export function putWorkspace(request: Request) {
  return endpoint(request, async () => {
    const identity = await getStore().identity(sessionToken(request));
    const input = await readJson(request, 2 * 1024 * 1024);
    if (input.workspaceId !== identity.workspace.id) throw new AppError(409, 'Your active workspace changed. Reload to continue.');
    return getStore().saveWorkspace(sessionToken(request), input.state, input.revision);
  });
}

export function listWorkspaces(request: Request) {
  return endpoint(request, async () => ({ workspaces: (await getStore().readWorkspace(sessionToken(request))).workspaces }));
}

export function switchWorkspace(request: Request) {
  return endpoint(request, async () => {
    await getStore().identity(sessionToken(request));
    const input = await readJson(request);
    const session = await getStore().switchWorkspace(sessionToken(request), input.workspaceId);
    return json(await getStore().readWorkspace(session.token), 200, sessionCookie(session.token, session.expiresAt));
  });
}

export function getInvitation(request: Request) {
  return endpoint(request, () => getStore().invitationDetails(new URL(request.url).searchParams.get('token') ?? ''));
}

export function createInvitation(request: Request) {
  return endpoint(request, async () => {
    const identity = await getStore().identity(sessionToken(request));
    const input = await readJson(request);
    if (input.workspaceId !== identity.workspace.id) throw new AppError(409, 'Your active workspace changed. Reload before inviting teammates.');
    return json(await getStore().createInvitation(sessionToken(request), input.email), 201);
  });
}

export function acceptInvitation(request: Request) {
  return endpoint(request, async () => {
    await getStore().identity(sessionToken(request));
    const input = await readJson(request);
    if (typeof input.token !== 'string') throw new AppError(400, 'An invitation token is required.');
    const accepted = await getStore().acceptInvitation(sessionToken(request), input.token);
    return json(await getStore().readWorkspace(accepted.token), 200, sessionCookie(accepted.token, accepted.expiresAt));
  });
}
