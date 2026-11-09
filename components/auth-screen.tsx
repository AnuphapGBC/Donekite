'use client';

import {useEffect,useRef,useState,useSyncExternalStore,type FormEvent} from 'react';
import Link from 'next/link';
import {ArrowRight,Check,Eye,EyeOff,FileText,Inbox,LoaderCircle,Receipt,Users} from 'lucide-react';
import {parseSaved,type State} from '@/lib/automation';
import {industries,type IndustryId} from '@/lib/industries';
import {ThemeToggle} from '@/components/theme-provider';

export type Session = {
  user:{id:string;name:string;email:string};
  workspace:{id:string;name:string;role:string};
  workspaces?:{id:string;name:string;role:string}[];
  state:State;
  revision:number;
};

type Invitation = {email:string;workspaceName:string;expiresAt:number|string};
type AuthScreenProps = {onAuthenticated:(session:Session)=>void};

function subscribeToLocation(onChange:()=>void) {
  window.addEventListener('popstate',onChange);
  return ()=>window.removeEventListener('popstate',onChange);
}
function currentInvitationToken() {return new URLSearchParams(window.location.search).get('invite')??'';}

function isRecord(value:unknown):value is Record<string,unknown> {
  return typeof value==='object'&&value!==null;
}
function responseError(value:unknown,fallback:string) {
  return isRecord(value)&&typeof value.error==='string'?value.error:fallback;
}
function isSession(value:unknown):value is Session {
  if(!value||typeof value!=='object') return false;
  const session=value as Partial<Session>;
  return !!session.user&&typeof session.user.id==='string'&&typeof session.user.name==='string'&&typeof session.user.email==='string'
    &&!!session.workspace&&typeof session.workspace.id==='string'&&typeof session.workspace.name==='string'&&typeof session.workspace.role==='string'
    &&Number.isInteger(session.revision)&&!!parseSaved(JSON.stringify(session.state));
}

export function AuthScreen({onAuthenticated}:AuthScreenProps) {
  const [mode,setMode]=useState<'login'|'register'>('login');
  const [name,setName]=useState('');
  const [businessName,setBusinessName]=useState('');
  const [industry,setIndustry]=useState<IndustryId>('general');
  const [email,setEmail]=useState('');
  const [password,setPassword]=useState('');
  const [showPassword,setShowPassword]=useState(false);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const inviteToken=useSyncExternalStore(subscribeToLocation,currentInvitationToken,()=> '');
  const [invitation,setInvitation]=useState<Invitation|null>(null);
  const [inviteError,setInviteError]=useState('');
  const [inviteAttempt,setInviteAttempt]=useState(0);
  const errorRef=useRef<HTMLParagraphElement>(null);
  const inviteLoading=!!inviteToken&&!invitation&&!inviteError;

  useEffect(()=>{
    if(!inviteToken) return;
    const controller=new AbortController();
    void fetch(`/api/invitations?token=${encodeURIComponent(inviteToken)}`,{signal:controller.signal,cache:'no-store'})
      .then(async response=>{
        const data=await response.json();
        if(!response.ok) throw new Error(responseError(data,'This invitation could not be opened.'));
        if(!isRecord(data)||typeof data.email!=='string'||typeof data.workspaceName!=='string'||(typeof data.expiresAt!=='number'&&typeof data.expiresAt!=='string')) throw new Error('This invitation could not be opened.');
        if(controller.signal.aborted) return;
        setInvitation({email:data.email,workspaceName:data.workspaceName,expiresAt:data.expiresAt});
        setEmail(data.email);
        setMode('register');
      })
      .catch((reason:unknown)=>{
        if(!controller.signal.aborted) setInviteError(reason instanceof Error?reason.message:'Could not load the invitation. Please try again.');
      });
    return ()=>controller.abort();
  },[inviteToken,inviteAttempt]);

  useEffect(()=>{if(error) errorRef.current?.focus();},[error]);

  function changeMode(next:'login'|'register') {
    setMode(next);
    setError('');
    setPassword('');
    setShowPassword(false);
  }

  async function submit(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if(busy||inviteLoading||inviteError) return;
    setBusy(true);
    setError('');
    try {
      const response=await fetch(`/api/auth/${mode}`,{
        method:'POST',headers:{'Content-Type':'application/json'},credentials:'same-origin',
        body:JSON.stringify({email:email.trim(),password,...(mode==='register'?{name:name.trim(),businessName:businessName.trim(),industry}:{}),...(inviteToken?{inviteToken}:{})}),
      });
      let data=await response.json().catch(()=>null);
      if(!response.ok) throw new Error(responseError(data,'Unable to continue. Please try again.'));
      if(inviteToken&&mode==='login') {
        const accepted=await fetch('/api/invitations/accept',{
          method:'POST',headers:{'Content-Type':'application/json'},credentials:'same-origin',
          body:JSON.stringify({token:inviteToken}),
        });
        data=await accepted.json().catch(()=>null);
        if(!accepted.ok) throw new Error(responseError(data,'Signed in, but this invitation could not be accepted.'));
      }
      if(!isSession(data)) throw new Error('Your workspace could not be loaded. Please try signing in again.');
      setPassword('');
      onAuthenticated(data);
    } catch(reason:unknown) {
      setError(reason instanceof TypeError?'Could not connect to DoneKite. Check your connection and try again.':reason instanceof Error?reason.message:'Unable to continue. Please try again.');
    } finally {setBusy(false);}
  }

  const registering=mode==='register';
  return <div className="auth-shell">
    <section className="auth-story" aria-labelledby="auth-story-title">
      <Link className="brand auth-brand" href="/" aria-label="DoneKite home">
        <span className="brandmark"><svg viewBox="0 0 28 28" fill="none" aria-hidden="true"><path d="M15 3 24 10 15 19 6 10Z" fill="currentColor"/><path d="M15 4v14M7 10h16" stroke="#243a30" strokeWidth="1.4"/><path d="M15 19c0 3-5 2-5 4s5 0 5 3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/></svg></span>
        <span>donekite<span className="brand-dot">.</span></span>
      </Link>
      <div className="auth-story-copy">
        <p className="auth-eyebrow">A LITTLE LESS BUSYWORK</p>
        <h1 id="auth-story-title">From first hello<br/>to a job well done.</h1>
        <p>Keep your customers, quotes, and invoices together. Give your team one place to pick up the next step.</p>
        <ol className="auth-steps">
          <li><span className="auth-step-icon"><Inbox size={21} aria-hidden="true"/></span><div className="auth-step-copy"><strong>Capture the enquiry</strong><span>Customer details and job notes, all together.</span></div><Check size={16} aria-hidden="true"/></li>
          <li><span className="auth-step-icon"><FileText size={21} aria-hidden="true"/></span><div className="auth-step-copy"><strong>Prepare the quote</strong><span>Clear pricing, with your approval at every step.</span></div><Check size={16} aria-hidden="true"/></li>
          <li><span className="auth-step-icon"><Receipt size={21} aria-hidden="true"/></span><div className="auth-step-copy"><strong>Track the invoice</strong><span>Follow the work through to recorded payment.</span></div><Check size={16} aria-hidden="true"/></li>
        </ol>
      </div>
      <p className="auth-story-footer"><Users size={17} aria-hidden="true"/>Shared workspace. Clear next steps. More time for your customers.</p>
    </section>

    <section className="auth-card" aria-labelledby="auth-form-title">
      <div className="auth-theme-control"><ThemeToggle/></div>
      <div className="auth-form-heading">
        <p className="auth-eyebrow">YOUR BUSINESS, IN GOOD ORDER</p>
        <h2 id="auth-form-title">{invitation?`Join ${invitation.workspaceName}`:registering?'Make room for better work.':'Welcome back.'}</h2>
        <p>{invitation?(registering?'Create your account to join the shared workspace.':'Sign in with your existing account to join this workspace.'):registering?'Create an account and set up your business workspace.':'Sign in to pick up where your team left off.'}</p>
      </div>
      <div className="auth-tabs" role="group" aria-label="Account action">
        <button type="button" aria-pressed={!registering} className={!registering?'active':''} onClick={()=>changeMode('login')} disabled={busy}>Sign in</button>
        <button type="button" aria-pressed={registering} className={registering?'active':''} onClick={()=>changeMode('register')} disabled={busy}>Create account</button>
      </div>
      {inviteLoading&&<p className="auth-invite" role="status"><LoaderCircle size={17} aria-hidden="true"/>Preparing your sign-in…</p>}
      {invitation&&<p className="auth-invite"><Users size={17} aria-hidden="true"/>You’re invited as {invitation.email}.</p>}
      {inviteError&&<div className="auth-error" role="alert"><p>{inviteError}</p><button type="button" className="link-button" onClick={()=>{setInviteError('');setInviteAttempt(attempt=>attempt+1);}}>Try again</button><Link href="/" onClick={()=>{setInvitation(null);setInviteError('');changeMode('login');}}>Continue without this invitation</Link></div>}
      <form className="auth-form" onSubmit={submit} aria-busy={busy}>
        <fieldset disabled={busy||inviteLoading||!!inviteError}>
          {registering&&<label className="auth-field" htmlFor="auth-name">Your name<input id="auth-name" name="name" autoComplete="name" required maxLength={100} value={name} onChange={event=>setName(event.target.value)} placeholder="Alex Morgan"/></label>}
          {registering&&!inviteToken&&<label className="auth-field" htmlFor="auth-business">Business name<input id="auth-business" name="businessName" autoComplete="organization" required maxLength={100} value={businessName} onChange={event=>setBusinessName(event.target.value)} placeholder="Your business"/></label>}
          {registering&&!inviteToken&&<label className="auth-field" htmlFor="auth-industry">Industry<select id="auth-industry" name="industry" value={industry} onChange={event=>setIndustry(event.target.value as IndustryId)}>{industries.map(preset=><option key={preset.id} value={preset.id}>{preset.label}</option>)}</select><small>Sets your enquiry fields and starter services. You can customize them later.</small></label>}
          <label className="auth-field" htmlFor="auth-email">Email address<input id="auth-email" name="email" type="email" autoComplete="email" required maxLength={150} readOnly={!!invitation} value={email} onChange={event=>setEmail(event.target.value)} placeholder="you@business.com"/></label>
          <label className="auth-field" htmlFor="auth-password">Password
            <span className="auth-password"><input id="auth-password" name="password" type={showPassword?'text':'password'} autoComplete={registering?'new-password':'current-password'} required minLength={registering?12:undefined} maxLength={128} aria-describedby={registering?'auth-password-hint':undefined} value={password} onChange={event=>setPassword(event.target.value)}/><button type="button" className="auth-password-toggle" aria-label={showPassword?'Hide password':'Show password'} aria-pressed={showPassword} onClick={()=>setShowPassword(visible=>!visible)}>{showPassword?<EyeOff size={18} aria-hidden="true"/>:<Eye size={18} aria-hidden="true"/>}</button></span>
            {registering&&<small id="auth-password-hint">Use at least 12 characters. A memorable phrase works well.</small>}
          </label>
          {error&&<p className="auth-error" role="alert" tabIndex={-1} ref={errorRef}>{error}</p>}
          <button type="submit" className="btn primary auth-submit">{busy?<><LoaderCircle size={17} aria-hidden="true"/>Opening your workspace…</>:<>{invitation?'Join workspace':registering?'Create workspace':'Sign in'}<ArrowRight size={17} aria-hidden="true"/></>}</button>
        </fieldset>
      </form>
      <p className="auth-note">{invitation?'You’ll join your team’s existing customers, quotes, and activity.':registering?'Your workspace starts empty, ready for your customers.':'Your team’s latest records will be here when you sign in.'}</p>
      <Link className="auth-demo-link" href="/demo">Explore the demo<ArrowRight size={15} aria-hidden="true"/></Link>
    </section>
  </div>;
}

export default AuthScreen;
