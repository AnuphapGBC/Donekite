import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { WorkspaceStore } from '../lib/server/store.ts';
import { createPostgresDatabase } from '../lib/server/database.ts';
import { AppError } from '../lib/server/errors.ts';
import { addLead, transition } from '../lib/automation.ts';
import { checkOrigin, endpoint, readJson, sessionCookie, sessionToken } from '../lib/server/http.ts';
import { createTestDatabase } from './helpers/postgres.ts';

const registration = { name: 'Alex Owner', email: 'alex@example.com', password: 'long-secure-password', businessName: 'Alex Cleaning' };
const leadInput = { name: 'Customer One', email: 'customer@example.com', service: 'Deep clean' as const, units: 2, notes: '', source: 'Website form' };
const hasStatus = (status: number) => (error: unknown) => error instanceof AppError && error.status === status;

test('PostgreSQL connection configuration rejects missing URLs and remote plaintext connections', () => {
  assert.throws(() => createPostgresDatabase(''), /DATABASE_URL is required/);
  assert.throws(() => createPostgresDatabase('not-a-url'), /valid PostgreSQL/);
  assert.throws(() => createPostgresDatabase('file:///tmp/database'), /must use PostgreSQL/);
  assert.throws(() => createPostgresDatabase('postgresql://test:test@database.example/app?sslmode=disable'), /TLS cannot be disabled/);
});

test('registered users get an empty durable PostgreSQL workspace; credentials are hashed at rest', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'donekite-test-'));
  const dataDir = join(directory, 'postgres');
  const database = await createTestDatabase(dataDir);
  const store = new WorkspaceStore(database);
  try {
    const session = await store.register(registration);
    const first = await store.readWorkspace(session.token);
    assert.equal(first.user.name, registration.name);
    assert.equal(first.workspace.name, registration.businessName);
    assert.equal(first.workspace.role, 'owner');
    assert.deepEqual(first.state.leads, []);
    assert.deepEqual(first.state.activity, []);
    const changed = addLead(first.state, leadInput).state;
    await store.saveWorkspace(session.token, changed, first.revision);
    const user = (await database.query<{ password_hash: string }>('SELECT password_hash FROM donekite.users')).rows[0];
    assert.match(user.password_hash, /^scrypt:[a-f0-9]{32}:[a-f0-9]{128}$/);
    assert.notEqual(user.password_hash, registration.password);
    assert.notEqual((await database.query<{ token_hash: string }>('SELECT token_hash FROM donekite.sessions')).rows[0].token_hash, session.token);
    await store.close();
    const reopened = new WorkspaceStore(await createTestDatabase(dataDir));
    try { assert.equal((await reopened.readWorkspace(session.token)).state.leads[0].email, leadInput.email); }
    finally { await reopened.close(); }
  } finally {
    try { await store.close(); } catch { /* Already closed before the durability check. */ }
    assert.equal(dirname(resolve(directory)), resolve(tmpdir()));
    rmSync(directory, { recursive: true, force: true });
  }
});

test('login normalizes email, rejects bad passwords, and logout revokes the server session', async () => {
  const store = new WorkspaceStore(await createTestDatabase());
  try {
    await store.register(registration);
    await assert.rejects(store.login({ email: registration.email, password: 'wrong-password' }), hasStatus(401));
    const session = await store.login({ email: ' ALEX@EXAMPLE.COM ', password: registration.password });
    assert.equal((await store.identity(session.token)).user.email, registration.email);
    await store.logout(session.token);
    await assert.rejects(store.identity(session.token), hasStatus(401));
    await assert.rejects(store.identity(undefined), hasStatus(401));
  } finally { await store.close(); }
});

test('sessions expire after seven days and repeated account login attempts are limited', async () => {
  let now = Date.now();
  const store = new WorkspaceStore(await createTestDatabase(), () => now);
  try {
    const session = await store.register(registration);
    now += 7 * 24 * 3600000;
    await assert.rejects(store.identity(session.token), hasStatus(401));
    for (let i = 0; i < 10; i++) await assert.rejects(store.login({ email: registration.email, password: 'wrong' }), hasStatus(401));
    await assert.rejects(store.login(registration), hasStatus(429));
    now += 15 * 60 * 1000;
    assert.ok((await store.login(registration)).token);
  } finally { await store.close(); }
});

test('workspaces are isolated and stale writes cannot overwrite a newer revision', async () => {
  const store = new WorkspaceStore(await createTestDatabase());
  try {
    const alice = await store.register(registration);
    const bob = await store.register({ ...registration, email: 'bob@example.com', businessName: 'Bob Cleaning' });
    const first = await store.readWorkspace(alice.token);
    const changed = addLead(first.state, leadInput).state;
    assert.equal((await store.saveWorkspace(alice.token, changed, first.revision)).revision, first.revision + 1);
    assert.deepEqual((await store.readWorkspace(bob.token)).state.leads, []);
    await assert.rejects(store.saveWorkspace(alice.token, first.state, first.revision), (error: unknown) => {
      assert.ok(error instanceof AppError);
      assert.equal(error.status, 409);
      assert.equal(error.details?.revision, first.revision + 1);
      return true;
    });
    assert.equal((await store.readWorkspace(alice.token)).state.leads.length, 1);
    await assert.rejects(store.saveWorkspace(alice.token, { version: 1 }, 1), hasStatus(400));
  } finally { await store.close(); }
});

test('owner invitations are email-bound, single-use, and grant shared workspace access', async () => {
  const store = new WorkspaceStore(await createTestDatabase());
  try {
    const owner = await store.register(registration);
    const invite = await store.createInvitation(owner.token, 'teammate@example.com');
    assert.equal((await store.invitationDetails(invite.token)).workspaceName, registration.businessName);
    await assert.rejects(store.register({ ...registration, email: 'wrong@example.com', inviteToken: invite.token }), hasStatus(400));
    const teammate = await store.register({ name: 'Teammate', email: invite.email, password: registration.password, inviteToken: invite.token });
    const memberWorkspace = await store.readWorkspace(teammate.token);
    assert.equal(memberWorkspace.workspace.id, (await store.identity(owner.token)).workspace.id);
    assert.equal(memberWorkspace.workspace.role, 'member');
    await assert.rejects(store.invitationDetails(invite.token), hasStatus(400));
    await assert.rejects(store.createInvitation(teammate.token, 'third@example.com'), hasStatus(403));
    const changed = addLead(memberWorkspace.state, leadInput).state;
    await store.saveWorkspace(teammate.token, changed, memberWorkspace.revision);
    assert.equal((await store.readWorkspace(owner.token)).state.leads[0].email, leadInput.email);
  } finally { await store.close(); }
});

test('existing accounts can accept an invitation and expired invitations cannot be used', async () => {
  let now = Date.now();
  const store = new WorkspaceStore(await createTestDatabase(), () => now);
  try {
    const owner = await store.register(registration);
    const other = await store.register({ ...registration, email: 'other@example.com' });
    const originalWorkspace = (await store.identity(other.token)).workspace.id;
    const invite = await store.createInvitation(owner.token, 'other@example.com');
    const accepted = await store.acceptInvitation(other.token, invite.token);
    assert.equal((await store.identity(accepted.token)).workspace.id, (await store.identity(owner.token)).workspace.id);
    await assert.rejects(store.identity(other.token), hasStatus(401));
    const loggedIn = await store.login({ ...registration, email: 'other@example.com' });
    assert.equal((await store.identity(loggedIn.token)).workspace.id, (await store.identity(owner.token)).workspace.id);
    assert.equal((await store.readWorkspace(loggedIn.token)).workspaces.length, 2);
    await assert.rejects(store.switchWorkspace(owner.token, originalWorkspace), hasStatus(403));
    const switched = await store.switchWorkspace(loggedIn.token, originalWorkspace);
    assert.equal((await store.identity(switched.token)).workspace.id, originalWorkspace);
    const expired = await store.createInvitation(owner.token, 'later@example.com');
    now += 7 * 24 * 3600000;
    await assert.rejects(store.invitationDetails(expired.token), hasStatus(400));
  } finally { await store.close(); }
});

test('server clock prepares a reminder on access and preserves it across revision conflicts', async () => {
  let now = Date.now();
  const store = new WorkspaceStore(await createTestDatabase(), () => now);
  try {
    const session = await store.register(registration);
    const first = await store.readWorkspace(session.token);
    const captured = addLead(first.state, leadInput);
    const quoted = transition(captured.state, captured.id!, 'quote');
    const saved = await store.saveWorkspace(session.token, quoted, first.revision);
    now += 49 * 3600000;
    await assert.rejects(store.saveWorkspace(session.token, saved.state, saved.revision), hasStatus(409));
    const latest = await store.readWorkspace(session.token);
    assert.equal(latest.state.leads[0].followupAt, now);
    assert.equal(latest.revision, saved.revision + 1);
    assert.equal(latest.state.activity.filter(item => item.kind === 'followup').length, 1);
  } finally { await store.close(); }
});

test('initial PostgreSQL migration is repeatable without replacing account data', async () => {
  const database = await createTestDatabase();
  const store = new WorkspaceStore(database, () => Date.UTC(2026, 10, 8));
  try {
    const session = await store.register(registration);
    const first = await store.readWorkspace(session.token);
    await database.migrate();
    assert.deepEqual(await store.readWorkspace(session.token), first);
  } finally { await store.close(); }
});

test('concurrent writes from the same revision commit one change and reject the stale writer', async () => {
  const store = new WorkspaceStore(await createTestDatabase());
  try {
    const session = await store.register(registration);
    const first = await store.readWorkspace(session.token);
    const changed = addLead(first.state, leadInput).state;
    const results = await Promise.allSettled([
      store.saveWorkspace(session.token, changed, first.revision),
      store.saveWorkspace(session.token, changed, first.revision),
    ]);
    assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
    const rejected = results.find(result => result.status === 'rejected');
    assert.ok(rejected?.status === 'rejected' && hasStatus(409)(rejected.reason));
    const latest = await store.readWorkspace(session.token);
    assert.equal(latest.revision, first.revision + 1);
    assert.equal(latest.state.leads.length, 1);
  } finally { await store.close(); }
});

test('a concurrently redeemed invitation grants one membership and cannot be consumed twice', async () => {
  const database = await createTestDatabase();
  const store = new WorkspaceStore(database);
  try {
    const owner = await store.register(registration);
    const member = await store.register({ ...registration, email: 'member@example.com', businessName: 'Member Business' });
    const invite = await store.createInvitation(owner.token, 'member@example.com');
    const results = await Promise.allSettled([
      store.acceptInvitation(member.token, invite.token),
      store.acceptInvitation(member.token, invite.token),
    ]);
    assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
    const rejected = results.find(result => result.status === 'rejected');
    assert.ok(rejected?.status === 'rejected' && (hasStatus(400)(rejected.reason) || hasStatus(401)(rejected.reason)));
    const count = await database.query<{ count: number }>('SELECT count(*)::integer AS count FROM donekite.memberships WHERE workspace_id = $1', [(await store.identity(owner.token)).workspace.id]);
    assert.equal(count.rows[0].count, 2);
  } finally { await store.close(); }
});

test('HTTP boundary rejects cross-origin mutations and oversized or malformed JSON', async () => {
  const good = new Request('http://localhost:3000/api/workspace', { method: 'PUT', headers: { origin: 'http://localhost:3000', 'content-type': 'application/json' }, body: '{}' });
  assert.doesNotThrow(() => checkOrigin(good));
  assert.throws(() => checkOrigin(new Request('http://localhost:3000/api/workspace', { method: 'PUT', headers: { origin: 'https://attacker.example' } })), hasStatus(403));
  assert.throws(() => checkOrigin(new Request('http://localhost:3000/api/workspace', { method: 'PUT' })), hasStatus(403));
  assert.deepEqual(await readJson(good), {});
  await assert.rejects(readJson(new Request('http://localhost', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{invalid' })), hasStatus(400));
  await assert.rejects(readJson(new Request('http://localhost', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text: 'x'.repeat(100) }) }), 20), hasStatus(413));
  const denied = await endpoint(new Request('http://localhost:3000/api/workspace', { method: 'PUT' }), () => ({ ok: true }));
  assert.equal(denied.status, 403);
  assert.equal(denied.headers.get('cache-control'), 'no-store');
  assert.match(sessionCookie('abc', Date.now()), /HttpOnly; SameSite=Lax/);
  assert.equal(sessionToken(new Request('http://localhost', { headers: { cookie: 'other=one; donekite_session=abc' } })), 'abc');
});
