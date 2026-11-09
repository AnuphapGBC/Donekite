'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { Download, Upload } from 'lucide-react';
import type { State } from '@/lib/automation';
import { maxBackupBytes, parseWorkspaceBackup } from '@/lib/workspace-storage';

export function WorkspaceBackup({ state, onRestore }: {
  state: State;
  onRestore: (state: State) => void;
}) {
  const inputId = useId();
  const fileInput = useRef<HTMLInputElement>(null);
  const request = useRef(0);
  const [pending, setPending] = useState<{ state: State; name: string } | null>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [reading, setReading] = useState(false);

  useEffect(() => () => { request.current++; }, []);

  function download() {
    setError('');
    try {
      const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = 'donekite-workspace.json';
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setMessage('Backup download started. Keep this JSON file to restore your workspace later.');
    } catch {
      setError('The backup could not be downloaded. Please try again.');
    }
  }

  async function chooseFile(file: File | undefined) {
    const currentRequest = ++request.current;
    setPending(null);
    setError('');
    setMessage('');
    setReading(false);
    if (!file) return;
    if (file.size > maxBackupBytes) {
      setError('This backup is too large. Choose a JSON backup smaller than 5 MB.');
      return;
    }
    setReading(true);
    try {
      const result = parseWorkspaceBackup(await file.text());
      if (request.current !== currentRequest) return;
      if (result.error) setError(result.error);
      else if (result.state) setPending({ state: result.state, name: file.name });
    } catch {
      if (request.current === currentRequest) setError('This file could not be read. Please choose a readable JSON backup.');
    } finally {
      if (request.current === currentRequest) setReading(false);
    }
  }

  return <section className="panel workspace-backup" aria-labelledby={`${inputId}-title`}>
    <div>
      <h2 id={`${inputId}-title`}>Keep a copy of your workspace</h2>
      <p>Download your enquiries, activity, rules, and pricing. Restore the JSON file in another browser when you need it.</p>
    </div>
    <div className="backup-actions">
      <button type="button" className="btn secondary" onClick={download}><Download size={16} />Download backup</button>
      <button type="button" className="btn secondary" disabled={reading} onClick={() => fileInput.current?.click()}><Upload size={16} />{reading ? 'Reading backup…' : 'Restore backup'}</button>
      <input ref={fileInput} id={inputId} type="file" accept=".json,application/json" hidden aria-label="Choose a workspace backup" onChange={event => {
        const file = event.currentTarget.files?.[0];
        event.currentTarget.value = '';
        void chooseFile(file);
      }} />
    </div>
    {error && <p className="form-error" role="alert">{error}</p>}
    {message && <p role="status">{message}</p>}
    {pending && <div className="backup-confirmation" role="region" aria-label="Confirm workspace restore" aria-live="polite">
      <h3>Replace this workspace?</h3>
      <p><strong>{pending.name}</strong> contains {pending.state.leads.length} enquiries and {pending.state.activity.length} activity entries. Restoring replaces the current {state.leads.length} enquiries, history, rules, and pricing. Download a backup first if you want to keep them.</p>
      <div className="backup-actions">
        <button type="button" className="btn secondary" onClick={() => setPending(null)}>Cancel</button>
        <button type="button" className="btn primary" onClick={() => {
          onRestore(pending.state);
          setPending(null);
          setMessage('Workspace restored.');
        }}>Replace workspace</button>
      </div>
    </div>}
  </section>;
}
