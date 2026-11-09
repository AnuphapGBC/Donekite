'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { State } from '@/lib/automation';
import {
  readWorkspace,
  saveWorkspace,
  storageWarnings,
  workspaceStorageKey,
  type WorkspaceStorage,
} from '@/lib/workspace-storage';

export function useWorkspace() {
  const [state, setState] = useState<State | null>(null);
  const [storageWarning, setStorageWarning] = useState('');
  const persistence = useRef<{
    storage: WorkspaceStorage | null;
    raw: string | null;
    blocked: boolean;
  } | null>(null);

  useEffect(() => {
    let storage: WorkspaceStorage | null = null;
    try { storage = window.localStorage; } catch { /* Restricted browser storage. */ }
    const snapshot = readWorkspace(storage);
    persistence.current = {
      storage,
      raw: snapshot.raw,
      blocked: snapshot.issue === 'invalid' || snapshot.issue === 'unavailable',
    };
    // Hydrate browser-only storage after SSR; persistence stays blocked until this read completes.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setStorageWarning(snapshot.issue ? storageWarnings[snapshot.issue] : '');
    setState(snapshot.state);
  }, []);

  useEffect(() => {
    const current = persistence.current;
    if (!state || !current || current.blocked) return;
    const result = saveWorkspace(current.storage, state, current.raw);
    if (result.issue === 'conflict') current.blocked = true;
    current.raw = result.raw;
    setStorageWarning(result.issue ? storageWarnings[result.issue] : '');
  }, [state]);

  // Only call for an explicit, confirmed restore/reset. Ordinary edits use setState.
  const replaceState = useCallback((replacement: State) => {
    const current = persistence.current;
    if (current) {
      try {
        if (!current.storage) current.storage = window.localStorage;
        current.raw = current.storage.getItem(workspaceStorageKey);
        current.blocked = false;
      } catch {
        current.blocked = true;
        setStorageWarning(storageWarnings.unavailable);
      }
    }
    setState(replacement);
  }, []);

  return { state, setState, storageWarning, replaceState };
}
