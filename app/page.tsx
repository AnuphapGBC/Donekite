'use client';

import { useCallback, useEffect, useState } from 'react';
import { AuthScreen, type Session } from '@/components/auth-screen';
import { BusinessWorkspace } from '@/components/business-workspace';

export default function Home() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [inviteToken, setInviteToken] = useState('');
  const load = useCallback(async () => {
    try {
      const response = await fetch('/api/auth/session', { cache: 'no-store' });
      if (response.ok) {
        setSession(await response.json());
        setInviteToken(new URLSearchParams(window.location.search).get('invite') ?? '');
      }
      else if (response.status !== 401) throw new Error();
    } catch { setError('We could not connect to DoneKite. Check your connection and try again.'); }
    finally { setLoading(false); }
  }, []);
  function retry() { setLoading(true); setError(''); void load(); }
  // Session hydration starts an external request; subsequent state updates follow its response.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); }, [load]);
  const expired = useCallback(() => setSession(null), []);
  function authenticated(next: Session) {
    setSession(next);
    setInviteToken('');
    window.history.replaceState({}, '', '/');
  }
  if (loading) return <div className="app-loading" role="status"><span className="app-wordmark">donekite<span>.</span></span><p>Opening your workspace…</p></div>;
  if (error) return <div className="app-loading"><h1>Let’s reconnect.</h1><p role="alert">{error}</p><button className="btn primary" onClick={retry}>Try again</button></div>;
  if (!session) return <AuthScreen onAuthenticated={authenticated}/>;
  if (inviteToken) return <SignedInInvitation session={session} token={inviteToken} onAccepted={authenticated} onCancel={() => authenticated(session)} onSignedOut={expired}/>;
  return <BusinessWorkspace key={session.workspace.id} session={session} onSignedOut={expired} onSessionChanged={authenticated}/>;
}

function SignedInInvitation({ session, token, onAccepted, onCancel, onSignedOut }: { session: Session; token: string; onAccepted: (session: Session) => void; onCancel: () => void; onSignedOut: () => void }) {
  const [invitation, setInvitation] = useState<{ email: string; workspaceName: string } | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    void fetch(`/api/invitations?token=${encodeURIComponent(token)}`, { cache: 'no-store', signal: controller.signal })
      .then(async response => {
        const data = await response.json() as { email: string; workspaceName: string; error?: string };
        if (!response.ok) throw new Error(data.error || 'This invitation is unavailable.');
        setInvitation(data);
      }).catch(cause => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Could not open invitation.'); });
    return () => controller.abort();
  }, [token]);
  async function accept() {
    setBusy(true); setError('');
    try {
      const response = await fetch('/api/invitations/accept', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token }) });
      const data = await response.json() as Session & { error?: string };
      if (!response.ok) throw new Error(data.error || 'Could not accept invitation.');
      onAccepted(data);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not accept invitation.'); }
    finally { setBusy(false); }
  }
  async function signOut() {
    setBusy(true);
    try { const response = await fetch('/api/auth/logout', { method: 'POST' }); if (!response.ok) throw new Error(); onSignedOut(); }
    catch { setError('Could not sign out. Please try again.'); }
    finally { setBusy(false); }
  }
  const matches = invitation?.email === session.user.email;
  return <main className="panel invitation-screen"><span className="app-wordmark">donekite<span>.</span></span><h1>{invitation ? `Join ${invitation.workspaceName}` : 'Your workspace invitation'}</h1>{invitation && <p>This invitation is for {invitation.email}. You’re signed in as {session.user.email}.{matches ? ' Join to view and update this team’s shared records.' : ' Sign in with the invited email address to join.'}</p>}{!invitation && !error && <p role="status">Opening invitation…</p>}{error && <p className="form-error" role="alert">{error}</p>}<div className="invitation-actions">{invitation && (matches ? <button className="btn primary" disabled={busy} onClick={accept}>{busy ? 'Joining…' : 'Join workspace'}</button> : <button className="btn primary" disabled={busy} onClick={signOut}>Sign in with another account</button>)}<button className="btn secondary" disabled={busy} onClick={onCancel}>Back to my workspace</button></div></main>;
}
