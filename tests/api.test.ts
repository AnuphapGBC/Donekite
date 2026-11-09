import { test } from 'node:test';
import assert from 'node:assert/strict';
import { register, login, session, getWorkspace, putWorkspace, createInvitation, acceptInvitation, switchWorkspace, logout } from '../lib/server/actions.ts';
import { WorkspaceStore } from '../lib/server/store.ts';
import { addLead, transition, type State } from '../lib/automation.ts';
import { createTestDatabase } from './helpers/postgres.ts';

test('API account, invitation and enquiry flow protects shared data across browser workspace switches', async () => {
  const globalStore = globalThis as typeof globalThis & { donekiteStore?: WorkspaceStore };
  const previous = globalStore.donekiteStore;
  const store = new WorkspaceStore(await createTestDatabase());
  globalStore.donekiteStore = store;
  const base = 'http://localhost:3000';
  const request = (path: string, method = 'GET', cookie = '', body?: unknown) => new Request(base + path, {
    method, headers: { origin: base, cookie, ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const cookieOf = (response: Response) => response.headers.get('set-cookie')!.split(';')[0];
  try {
    assert.equal((await session(request('/api/auth/session'))).status, 401);
    const ownerResponse = await register(request('/api/auth/register', 'POST', '', { name: 'Owner', email: 'owner@example.com', password: 'test-password-long', businessName: 'Owner Business' }));
    assert.equal(ownerResponse.status, 201);
    assert.match(ownerResponse.headers.get('set-cookie')!, /HttpOnly; SameSite=Lax/);
    const ownerCookie = cookieOf(ownerResponse);
    const owner = await ownerResponse.json() as { workspace: { id: string }; state: State; revision: number };
    assert.equal(owner.state.leads.length, 0);
    const customer = addLead(owner.state, { name: 'Real Workflow Test', email: 'customer@example.com', service: 'Deep clean', units: 3, source: 'Phone', notes: 'API regression fixture' });
    let state = transition(customer.state, customer.id!, 'quote');
    state = transition(state, customer.id!, 'accept');
    state = transition(state, customer.id!, 'paid');
    const save = await putWorkspace(request('/api/workspace', 'PUT', ownerCookie, { workspaceId: owner.workspace.id, state, revision: owner.revision }));
    assert.equal(save.status, 200);
    const saved = await save.json() as { state: State; revision: number };
    assert.equal(saved.state.leads[0].status, 'Paid');
    assert.equal((await putWorkspace(request('/api/workspace', 'PUT', ownerCookie, { workspaceId: owner.workspace.id, state: owner.state, revision: owner.revision }))).status, 409);

    const memberResponse = await register(request('/api/auth/register', 'POST', '', { name: 'Member', email: 'member@example.com', password: 'test-password-long', businessName: 'Member Business' }));
    const memberCookie = cookieOf(memberResponse);
    const member = await memberResponse.json() as { workspace: { id: string } };
    const inviteResponse = await createInvitation(request('/api/invitations', 'POST', ownerCookie, { email: 'member@example.com', workspaceId: owner.workspace.id }));
    assert.equal(inviteResponse.status, 201);
    const invite = await inviteResponse.json() as { token: string };
    const acceptance = await acceptInvitation(request('/api/invitations/accept', 'POST', memberCookie, { token: invite.token }));
    assert.equal(acceptance.status, 200);
    const sharedCookie = cookieOf(acceptance);
    const shared = await acceptance.json() as { workspace: { id: string }; state: State; revision: number };
    assert.equal(shared.workspace.id, owner.workspace.id);
    assert.equal(shared.state.leads[0].status, 'Paid');
    assert.equal((await createInvitation(request('/api/invitations', 'POST', sharedCookie, { workspaceId: owner.workspace.id, email: 'third@example.com' }))).status, 403);

    const switchedResponse = await switchWorkspace(request('/api/workspaces', 'POST', sharedCookie, { workspaceId: member.workspace.id }));
    assert.equal(switchedResponse.status, 200);
    const switchedCookie = cookieOf(switchedResponse);
    // A different tab now shares the new session cookie but retains the old workspace data.
    assert.equal((await getWorkspace(request(`/api/workspace?workspaceId=${owner.workspace.id}`, 'GET', switchedCookie))).status, 409);
    assert.equal((await putWorkspace(request('/api/workspace', 'PUT', switchedCookie, { workspaceId: owner.workspace.id, state: shared.state, revision: 0 }))).status, 409);
    assert.equal((await createInvitation(request('/api/invitations', 'POST', switchedCookie, { workspaceId: owner.workspace.id, email: 'wrong-business@example.com' }))).status, 409);
    const untouched = await getWorkspace(request(`/api/workspace?workspaceId=${member.workspace.id}`, 'GET', switchedCookie));
    assert.equal((await untouched.json() as { state: State }).state.leads.length, 0);
    assert.equal((await logout(request('/api/auth/logout', 'POST', switchedCookie))).status, 200);
    assert.equal((await session(request('/api/auth/session', 'GET', switchedCookie))).status, 401);
    assert.equal((await login(request('/api/auth/login', 'POST', '', { email: 'member@example.com', password: 'incorrect' }))).status, 401);
    const denied = await putWorkspace(new Request(base + '/api/workspace', { method: 'PUT', headers: { origin: 'https://attacker.example', cookie: ownerCookie, 'content-type': 'application/json' }, body: '{}' }));
    assert.equal(denied.status, 403);
  } finally { await store.close(); globalStore.donekiteStore = previous; }
});
