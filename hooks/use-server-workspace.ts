'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Session } from '@/components/auth-screen';
import { parseSaved, type State } from '@/lib/automation';
import { liveChange } from '@/lib/live-workspace';

function snapshotResponse(value: unknown): { state: State; revision: number } | null {
  if (!value || typeof value !== 'object') return null;
  const data = value as Record<string, unknown>;
  const state = parseSaved(JSON.stringify(data.state));
  return state && Number.isSafeInteger(data.revision) && (data.revision as number) >= 0
    ? { state, revision: data.revision as number } : null;
}
function errorMessage(value: unknown) {
  return value && typeof value === 'object' && 'error' in value && typeof value.error === 'string'
    ? value.error : 'Your change could not be saved.';
}

export function useServerWorkspace(initial: Session, onExpired: () => void) {
  const [snapshot, setSnapshot] = useState({ state: initial.state, revision: initial.revision });
  const current = useRef(snapshot);
  const locked = useRef(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [connected, setConnected] = useState(true);
  const apply = useCallback((next: typeof snapshot) => {
    current.current = next;
    setSnapshot(next);
  }, []);

  const refresh = useCallback(async () => {
    if (locked.current) return;
    try {
      const response = await fetch(`/api/workspace?workspaceId=${encodeURIComponent(initial.workspace.id)}`, { cache: 'no-store' });
      if (response.status === 401) { onExpired(); return; }
      if (response.status === 409) { window.location.reload(); return; }
      if (!response.ok) throw new Error('Workspace is unavailable.');
      const next = snapshotResponse(await response.json());
      if (!next) throw new Error('Invalid workspace response.');
      if (!locked.current && next.revision >= current.current.revision) apply(next);
      setConnected(true);
    } catch { setConnected(false); }
  }, [apply, onExpired, initial.workspace.id]);

  useEffect(() => {
    const interval = setInterval(refresh, 20_000);
    window.addEventListener('focus', refresh);
    return () => { clearInterval(interval); window.removeEventListener('focus', refresh); };
  }, [refresh]);

  const mutate = async (change: (state: State) => State): Promise<boolean> => {
    if (locked.current) return false;
    locked.current = true;
    setSaving(true);
    setError('');
    try {
      const previous = current.current;
      const response = await fetch('/api/workspace', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId: initial.workspace.id, state: liveChange(previous.state, change), revision: previous.revision }),
      });
      if (response.status === 401) { onExpired(); return false; }
      const result = await response.json();
      if (response.status === 409) {
        const latest = snapshotResponse(result);
        if (!latest) { window.location.reload(); return false; }
        apply(latest);
        throw new Error('A teammate updated this workspace. The latest records are loaded; review them and try your action again.');
      }
      if (!response.ok) throw new Error(errorMessage(result));
      const next = snapshotResponse(result);
      if (!next) throw new Error('The server response could not be read. Refresh before trying again.');
      apply(next);
      setConnected(true);
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Your change could not be saved. Please try again.');
      return false;
    } finally { locked.current = false; setSaving(false); }
  };
  return { state: snapshot.state, saving, error, connected, mutate, refresh, clearError: () => setError('') };
}
