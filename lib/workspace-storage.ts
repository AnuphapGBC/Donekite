import { makeSeed, parseSaved, type State } from './automation.ts';

// Retain the original key so existing demo workspaces survive upgrades.
export const workspaceStorageKey = 'smallflow-demo-v1';
export const maxBackupBytes = 5 * 1024 * 1024;

export type WorkspaceStorage = Pick<Storage, 'getItem' | 'setItem'>;
export type StorageIssue = 'unavailable' | 'invalid' | 'conflict';
export type WorkspaceSnapshot = {
  state: State;
  raw: string | null;
  issue: StorageIssue | null;
};

export function readWorkspace(storage: WorkspaceStorage | null, now = Date.now()): WorkspaceSnapshot {
  try {
    if (!storage) throw new Error('Storage unavailable');
    const raw = storage.getItem(workspaceStorageKey);
    if (raw === null) return { state: makeSeed(now), raw, issue: null };
    const saved = parseSaved(raw);
    return saved
      ? { state: saved, raw, issue: null }
      : { state: makeSeed(now), raw, issue: 'invalid' };
  } catch {
    return { state: makeSeed(now), raw: null, issue: 'unavailable' };
  }
}

export function saveWorkspace(
  storage: WorkspaceStorage | null,
  state: State,
  expectedRaw: string | null,
): { raw: string | null; issue: 'unavailable' | 'conflict' | null } {
  try {
    if (!storage) throw new Error('Storage unavailable');
    // Do not overwrite changes made in another tab since our last read/write.
    if (storage.getItem(workspaceStorageKey) !== expectedRaw) {
      return { raw: expectedRaw, issue: 'conflict' };
    }
    const raw = JSON.stringify(state);
    storage.setItem(workspaceStorageKey, raw);
    return { raw, issue: null };
  } catch {
    return { raw: expectedRaw, issue: 'unavailable' };
  }
}

export function parseWorkspaceBackup(raw: string): { state: State; error?: never } | { state?: never; error: string } {
  if (new TextEncoder().encode(raw).byteLength > maxBackupBytes) {
    return { error: 'This backup is too large. Choose a JSON backup smaller than 5 MB.' };
  }
  const state = parseSaved(raw.replace(/^\uFEFF/, ''));
  if (!state) return { error: 'This file is not a valid DoneKite workspace backup. Your current workspace has not changed.' };
  return { state };
}

export const storageWarnings: Record<StorageIssue, string> = {
  unavailable: 'Browser saving is unavailable or full. Your latest changes may only last for this visit. Download a workspace backup from Demo guide.',
  invalid: 'The saved workspace could not be read. It has been preserved, and automatic saving is paused. You can explore temporary sample data, restore a valid backup, or explicitly reset the demo from Demo guide.',
  conflict: 'Another tab changed this workspace. Automatic saving is paused to protect those changes. Download a backup of this tab before refreshing to load the other tab’s workspace.',
};
