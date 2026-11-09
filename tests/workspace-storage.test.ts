import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeSeed } from '../lib/automation.ts';
import {
  maxBackupBytes,
  parseWorkspaceBackup,
  readWorkspace,
  saveWorkspace,
  workspaceStorageKey,
  type WorkspaceStorage,
} from '../lib/workspace-storage.ts';

const now = Date.UTC(2026, 10, 8, 14);
function memoryStorage(initial: string | null = null) {
  let value = initial;
  const storage: WorkspaceStorage = {
    getItem(key) { assert.equal(key, workspaceStorageKey); return value; },
    setItem(key, next) { assert.equal(key, workspaceStorageKey); value = next; },
  };
  return storage;
}

test('valid workspaces load without creating or replacing data', () => {
  const seed = makeSeed(now);
  const raw = JSON.stringify(seed);
  const storage = memoryStorage(raw);
  assert.deepEqual(readWorkspace(storage), { state: seed, raw, issue: null });
  assert.equal(storage.getItem(workspaceStorageKey), raw);
});

test('a corrupt saved workspace is preserved and flagged to block automatic saving', () => {
  const raw = '{ damaged workspace';
  const storage = memoryStorage(raw);
  const result = readWorkspace(storage, now);
  assert.equal(result.issue, 'invalid');
  assert.equal(result.raw, raw);
  assert.equal(result.state.leads.length, 4);
  assert.equal(storage.getItem(workspaceStorageKey), raw);
});

test('missing storage and storage exceptions produce a usable temporary workspace', () => {
  const unavailable: WorkspaceStorage = {
    getItem() { throw new Error('Access denied'); },
    setItem() { throw new Error('Access denied'); },
  };
  for (const storage of [null, unavailable]) {
    const result = readWorkspace(storage, now);
    assert.equal(result.issue, 'unavailable');
    assert.equal(result.state.leads.length, 4);
  }
});

test('successful saves return the exact snapshot used by subsequent conflict checks', () => {
  const storage = memoryStorage();
  const state = makeSeed(now);
  const result = saveWorkspace(storage, state, null);
  assert.equal(result.issue, null);
  assert.equal(result.raw, JSON.stringify(state));
  assert.deepEqual(readWorkspace(storage).state, state);
  assert.equal(saveWorkspace(storage, state, result.raw).issue, null);
});

test('a newer workspace in another tab is never overwritten', () => {
  const storage = memoryStorage('newer data');
  const result = saveWorkspace(storage, makeSeed(now), 'older data');
  assert.equal(result.issue, 'conflict');
  assert.equal(storage.getItem(workspaceStorageKey), 'newer data');
});

test('quota failures are reported without claiming a successful save', () => {
  const storage: WorkspaceStorage = {
    getItem() { return null; },
    setItem() { throw new Error('Quota exceeded'); },
  };
  assert.deepEqual(saveWorkspace(storage, makeSeed(now), null), { raw: null, issue: 'unavailable' });
});

test('JSON backup import round trips and accepts an optional UTF-8 BOM', () => {
  const seed = makeSeed(now);
  for (const prefix of ['', '\uFEFF']) {
    assert.deepEqual(parseWorkspaceBackup(prefix + JSON.stringify(seed, null, 2)), { state: seed });
  }
});

test('invalid and oversized backup files are rejected before replacement', () => {
  for (const raw of ['not JSON', '{}', 'null', ' '.repeat(maxBackupBytes + 1)]) {
    const result = parseWorkspaceBackup(raw);
    assert.ok(result.error);
    assert.equal(result.state, undefined);
  }
  assert.match(parseWorkspaceBackup('é'.repeat(maxBackupBytes / 2 + 1)).error ?? '', /too large/);
});
