import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addLead, makeSeed } from '../lib/automation.ts';
import { createIndustrySettings, formatQuantity, getCatalog } from '../lib/industries.ts';
import { AppError } from '../lib/server/errors.ts';
import { WorkspaceStore } from '../lib/server/store.ts';
import { createTestDatabase } from './helpers/postgres.ts';

const account = { name: 'Event Owner', email: 'owner@example.com', password: 'a-long-test-password', businessName: 'Event Studio', industry: 'events' };

test('industry answers and original pricing survive PostgreSQL saves, template changes, and shared access', async () => {
  const store = new WorkspaceStore(await createTestDatabase());
  try {
    const owner = await store.register(account);
    const initial = await store.readWorkspace(owner.token);
    assert.equal(initial.state.settings.industry, 'events');
    const service = getCatalog(initial.state.settings).find(item => item.id === 'catering')!;
    assert.ok(service);
    const captured = addLead(initial.state, {
      name: 'Event Customer', email: 'customer@example.com', source: 'Phone', notes: '',
      service: service.name, serviceId: service.id, units: 40,
      details: { eventDate: '2027-06-12', location: 'Town hall', guestCount: '40' },
    });
    assert.equal(captured.error, undefined);
    const saved = await store.saveWorkspace(owner.token, captured.state, initial.revision);
    const changed = { ...saved.state, settings: createIndustrySettings('professional', saved.state.settings) };
    await store.saveWorkspace(owner.token, changed, saved.revision);
    const invitation = await store.createInvitation(owner.token, 'member@example.com');
    const member = await store.register({ ...account, email: 'member@example.com', inviteToken: invitation.token, industry: 'general' });
    const shared = await store.readWorkspace(member.token);
    assert.equal(shared.state.settings.industry, 'professional');
    const lead = shared.state.leads.find(item => item.id === captured.id)!;
    assert.equal(lead.industry, 'events');
    assert.equal(formatQuantity(lead), '40 guests');
    assert.equal(lead.amount, 1400);
    assert.deepEqual(lead.details, { eventDate: '2027-06-12', location: 'Town hall', guestCount: '40' });
    assert.equal(shared.workspace.id, initial.workspace.id);
  } finally { await store.close(); }
});

test('unsupported registration industries are rejected before an account is created', async () => {
  const database = await createTestDatabase();
  const store = new WorkspaceStore(database);
  try {
    await assert.rejects(store.register({ ...account, industry: 'unknown' }), error => error instanceof AppError && error.status === 400);
    assert.equal((await database.query<{ count: number }>('SELECT count(*)::int AS count FROM donekite.users')).rows[0].count, 0);
  } finally { await store.close(); }
});

test('industry migration preserves legacy prices and is safe to rerun', async () => {
  const database = await createTestDatabase();
  try {
    const legacy = makeSeed(Date.UTC(2026, 10, 9));
    delete legacy.settings.industry;
    const configured = { ...legacy, settings: createIndustrySettings('events') };
    await database.query('INSERT INTO donekite.workspaces(id, name, state, revision, created_at) VALUES ($1, $2, $3::jsonb, 4, 0), ($4, $5, $6::jsonb, 7, 0)', ['legacy', 'Legacy', JSON.stringify(legacy), 'events', 'Events', JSON.stringify(configured)]);
    await database.migrate();
    await database.migrate();
    const rows = (await database.query<{ id: string; state: typeof legacy; revision: number }>('SELECT id, state, revision FROM donekite.workspaces ORDER BY id')).rows;
    assert.deepEqual(rows[0], { id: 'events', state: configured, revision: 7 });
    assert.deepEqual(rows[1], { id: 'legacy', state: { ...legacy, settings: { ...legacy.settings, industry: 'cleaning' } }, revision: 5 });
  } finally { await database.close(); }
});
