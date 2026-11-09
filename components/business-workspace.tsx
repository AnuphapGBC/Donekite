'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { ArrowRight, ArrowUpRight, Check, ChevronRight, Download, FileText, Inbox, LayoutDashboard, LogOut, Menu, Plus, RefreshCw, Search, Settings2, Users, Workflow, X } from 'lucide-react';
import type { Session } from './auth-screen';
import { AppDialog } from './app-dialog';
import { CustomerRecord } from './customer-record';
import { useServerWorkspace } from '@/hooks/use-server-workspace';
import { addLead, exportCsv, money, services, setRule, total, transition, type LeadInput, type State, type Status } from '@/lib/automation';

type View = 'overview' | 'enquiries' | 'automations' | 'team';
const navigation = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'enquiries', label: 'Enquiries', icon: Inbox },
  { id: 'automations', label: 'Rules & pricing', icon: Workflow },
  { id: 'team', label: 'Your team', icon: Users },
] as const;
const labels: Record<Status, string> = { Draft: 'Quote draft', Quoted: 'Awaiting reply', Accepted: 'Accepted', Invoiced: 'Invoice ready', Paid: 'Paid', Closed: 'Closed' };
const newLead: LeadInput = { name: '', email: '', service: 'Deep clean', units: 1, notes: '', source: 'Website form' };

function downloadFile(body: string, name: string, type: string) {
  const url = URL.createObjectURL(new Blob([body], { type }));
  const link = document.createElement('a');
  link.href = url; link.download = name; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function BusinessWorkspace({ session, onSignedOut, onSessionChanged }: { session: Session; onSignedOut: () => void; onSessionChanged: (session: Session) => void }) {
  const { state, saving, error, connected, mutate, refresh, clearError } = useServerWorkspace(session, onSignedOut);
  const [view, setView] = useState<View>('overview');
  const [menuOpen, setMenuOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('All');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState(newLead);
  const [formError, setFormError] = useState('');
  const [notice, setNotice] = useState('');
  const [signingOut, setSigningOut] = useState(false);
  const [switching, setSwitching] = useState(false);
  const selected = state.leads.find(lead => lead.id === selectedId) ?? null;
  const open = state.leads.filter(lead => !['Paid', 'Closed'].includes(lead.status));
  const followups = state.leads.filter(lead => lead.status === 'Quoted' && lead.followupAt !== undefined);
  const invoices = state.leads.filter(lead => lead.status === 'Invoiced');
  const filtered = state.leads.filter(lead => (status === 'All' || status === lead.status) && `${lead.name} ${lead.email} ${lead.service}`.toLowerCase().includes(query.trim().toLowerCase()));

  function navigate(next: View) { setView(next); setMenuOpen(false); setNotice(''); }
  async function capture(event: FormEvent) {
    event.preventDefault(); setFormError('');
    let createdId: string | undefined;
    const ok = await mutate(current => {
      const result = addLead(current, form);
      if (result.error) throw new Error(result.error);
      createdId = result.id;
      return result.state;
    });
    if (ok) { setCreating(false); setForm(newLead); setSelectedId(createdId ?? null); setNotice('Enquiry saved. Your quote is ready to review.'); }
  }
  async function signOut() {
    setSigningOut(true);
    try {
      const result = await fetch('/api/auth/logout', { method: 'POST' });
      if (!result.ok) throw new Error();
      onSignedOut();
    } catch { setNotice('Could not sign out. Please try again.'); }
    finally { setSigningOut(false); }
  }
  async function switchWorkspace(workspaceId: string) {
    setSwitching(true);
    try {
      const response = await fetch('/api/workspaces', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ workspaceId }) });
      const data = await response.json() as Session & { error?: string };
      if (!response.ok) throw new Error(data.error || 'Could not switch workspace.');
      onSessionChanged(data);
    } catch (cause) { setNotice(cause instanceof Error ? cause.message : 'Could not switch workspace.'); }
    finally { setSwitching(false); }
  }
  const createButton = <button className="btn primary" onClick={() => { clearError(); setCreating(true); }}><Plus size={17}/>New enquiry</button>;
  const table = (items = filtered) => <div className="table-scroll"><table className="lead-table live-table"><caption className="sr-only">Customer enquiries and their next step</caption><thead><tr><th>Customer</th><th>Service</th><th>Status</th><th className="right">Total CAD</th><th><span className="sr-only">Open record</span></th></tr></thead><tbody>
    {items.map(lead => <tr key={lead.id}><td><button className="customer" onClick={() => setSelectedId(lead.id)}><span className="live-avatar">{lead.name.slice(0, 1).toUpperCase()}</span><span><strong>{lead.name}</strong><small>{lead.email}</small></span></button></td><td>{lead.service}<small>{lead.units} {lead.service === 'Office clean' ? 'hours' : 'bedrooms'}</small></td><td><span className={`badge badge-${lead.status.toLowerCase()}`}>{labels[lead.status]}</span></td><td className="right">{money(total(lead))}</td><td><button className="icon-button" aria-label={`Open ${lead.name}`} onClick={() => setSelectedId(lead.id)}><ArrowUpRight size={18}/></button></td></tr>)}
  </tbody></table>{!items.length && <div className="live-empty"><Inbox size={30}/><h3>{state.leads.length ? 'No matching enquiries' : 'Your next customer starts here.'}</h3><p>{state.leads.length ? 'Try another name, service, or status.' : 'Add an enquiry to prepare a quote and keep every next step together.'}</p>{state.leads.length ? <button className="btn secondary" onClick={() => { setQuery(''); setStatus('All'); }}>Clear filters</button> : createButton}</div>}</div>;

  return <div className="app-shell live-app"><a className="skip-link" href="#workspace-content">Skip to content</a>
    {menuOpen && <button className="mobile-scrim" onClick={() => setMenuOpen(false)} aria-label="Close navigation"/>}
    <aside className={`sidebar ${menuOpen ? 'mobile-open' : ''}`}>
      <Link className="app-wordmark" href="/">donekite<span>.</span></Link>
      <div className="workspace"><span className="workspace-icon"><Workflow size={20}/></span><div><strong>{session.workspace.name}</strong><small>Shared business workspace</small></div></div>
      {(session.workspaces?.length ?? 0) > 1 && <select className="workspace-switch" aria-label="Switch workspace" value={session.workspace.id} disabled={saving || switching} onChange={event => switchWorkspace(event.target.value)}>{session.workspaces!.map(workspace => <option key={workspace.id} value={workspace.id}>{workspace.name}</option>)}</select>}
      <p className="nav-label">WORKSPACE</p><nav aria-label="Main navigation">{navigation.map(({ id, label, icon: Icon }) => <button key={id} className={`nav-item ${view === id ? 'active' : ''}`} aria-current={view === id ? 'page' : undefined} onClick={() => navigate(id)}><Icon size={19}/>{label}{id === 'enquiries' && <span className="nav-count">{open.length}</span>}</button>)}</nav>
      <div className="sidebar-bottom"><div className="workspace-help"><span>GETTING STARTED</span><p>A clear path from enquiry to payment.</p><a href="/demo" target="_blank" rel="noreferrer">Explore the guided demo <ArrowUpRight size={14}/></a></div><div className="live-profile"><span className="live-avatar">{session.user.name.slice(0, 1)}</span><div><strong>{session.user.name}</strong><small>{session.workspace.role === 'owner' ? 'Workspace owner' : 'Team member'}</small></div><button className="icon-button" disabled={signingOut || saving} onClick={signOut} aria-label="Sign out"><LogOut size={17}/></button></div></div>
    </aside>
    <div className="main-shell"><header className="topbar"><div className="breadcrumb"><button className="mobile-menu icon-button" onClick={() => setMenuOpen(!menuOpen)} aria-label="Toggle navigation" aria-expanded={menuOpen}><Menu size={21}/></button><span>{session.workspace.name}</span><ChevronRight size={14}/><strong>{navigation.find(item => item.id === view)?.label}</strong></div><div className="top-actions"><span className={`save-status ${!connected ? 'offline' : ''}`} role="status"><span/>{saving ? 'Saving…' : connected ? 'Connected' : 'Connection interrupted'}</span><button className="icon-button" onClick={refresh} disabled={saving} aria-label="Refresh workspace"><RefreshCw size={17}/></button></div></header>
      <main id="workspace-content" tabIndex={-1}>
        <div className="page-heading"><div><p className="eyebrow">{new Intl.DateTimeFormat('en-CA', { weekday: 'long', month: 'long', day: 'numeric' }).format(new Date())}</p><h1>{view === 'overview' ? 'A little less busywork.' : view === 'enquiries' ? 'Every enquiry, in one place.' : view === 'automations' ? 'Set your work in motion.' : 'Better, together.'}</h1><p className="page-description">{view === 'overview' ? 'A clear view of your customers and what comes next.' : view === 'enquiries' ? 'From the first hello to a paid invoice. Keep the details together.' : view === 'automations' ? 'Set your rates and choose which drafts DoneKite prepares.' : 'Invite the people who help you keep things moving.'}</p></div>{view !== 'team' && createButton}</div>
        {error && <div className="app-alert" role="alert">{error}<button className="icon-button" aria-label="Dismiss error" onClick={clearError}><X size={17}/></button></div>}
        {notice && <div className="app-notice" role="status">{notice}<button className="icon-button" onClick={() => setNotice('')} aria-label="Dismiss notice"><X size={17}/></button></div>}
        {!connected && <div className="app-alert">Unable to refresh records. Reconnect before making changes.<button className="link-button" onClick={refresh}>Try again</button></div>}
        {view === 'overview' && <>
          <section className="live-welcome"><div><span className="section-kicker">YOUR BUSINESS, WITH A LITTLE MORE FLOW</span><h2>Good work starts<br/>with a clear next step.</h2><p>{open.length ? `${open.length} open ${open.length === 1 ? 'enquiry needs' : 'enquiries need'} your attention. Let’s keep things moving.` : 'Your workspace is ready. Capture your first enquiry and let the details fall into place.'}</p><button className="btn dark" onClick={() => open.length ? navigate('enquiries') : setCreating(true)}>{open.length ? 'View your enquiries' : 'Add your first enquiry'}<ArrowRight size={17}/></button></div><div className="live-flow">{[{ icon: Inbox, name: 'Enquiry captured', sub: 'The details, all together' }, { icon: FileText, name: 'Quote prepared', sub: 'Your pricing. Your approval.' }, { icon: Check, name: 'Job well done', sub: 'An invoice and a clear record' }].map(({ icon: Icon, name, sub }, index) => <div key={name}><span className="live-flow-number">0{index + 1}</span><Icon size={21}/><span><strong>{name}</strong><small>{sub}</small></span><Check size={15}/></div>)}</div></section>
          <section className="stats-grid live-stats" aria-label="Business summary">{[{ label: 'Open enquiries', value: open.length, note: 'Ready for the next step' }, { label: 'Open quote value', value: money(open.reduce((sum, lead) => sum + lead.amount, 0)), note: 'Before tax · CAD' }, { label: 'Follow-ups ready', value: followups.length, note: 'Drafts waiting for review' }, { label: 'Outstanding invoices', value: money(invoices.reduce((sum, lead) => sum + total(lead), 0)), note: `${invoices.length} awaiting payment` }].map(metric => <article className="stat" key={metric.label}><div className="stat-label">{metric.label}</div><strong>{metric.value}</strong><p>{metric.note}</p></article>)}</section>
          <div className="dashboard-grid"><section className="panel"><div className="panel-heading"><div><h2>Recent enquiries</h2><p>Small details. Clear next steps.</p></div><button className="link-button" onClick={() => navigate('enquiries')}>View all<ArrowUpRight size={15}/></button></div>{table(state.leads.slice(0, 5))}</section><section className="panel"><div className="panel-heading"><div><h2>Latest activity</h2><p>A shared record of your team’s work.</p></div></div><div className="live-activity">{state.activity.slice(0, 6).map(item => <div key={item.id}><span className="activity-icon"><Workflow size={16}/></span><div>{item.leadId ? <button onClick={() => setSelectedId(item.leadId!)}>{item.title}</button> : <strong>{item.title}</strong>}<p>{item.detail}</p><small>{new Date(item.at).toLocaleString('en-CA', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</small></div></div>)}{!state.activity.length && <div className="quiet-empty">Your first enquiry starts the story. Activity will appear here as your team works.</div>}</div></section></div>
        </>}
        {view === 'enquiries' && <section className="panel"><div className="table-toolbar"><div className="search-field"><Search size={18}/><input aria-label="Search enquiries" placeholder="Search customers or services…" value={query} onChange={event => setQuery(event.target.value)}/></div><select className="live-select" aria-label="Filter by status" value={status} onChange={event => setStatus(event.target.value)}><option>All</option>{Object.entries(labels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><button className="btn secondary" onClick={() => downloadFile(exportCsv(filtered), 'donekite-enquiries.csv', 'text/csv;charset=utf-8;')}><Download size={16}/>Export CSV</button></div>{table()}<div className="panel-footer">{filtered.length} of {state.leads.length} enquiries<span>Amounts include tax · CAD</span></div></section>}
        {view === 'automations' && <PricingAndRules state={state} saving={saving} mutate={mutate}/>}
        {view === 'team' && <Team session={session}/>}
        <footer className="live-footer"><span>donekite · Less admin, more business.</span><span>Shared records · Your team stays in control</span></footer>
      </main>
    </div>
    <AppDialog open={creating} onClose={() => !saving && setCreating(false)} title="New enquiry"><form className="enquiry-form live-form" onSubmit={capture}><p className="modal-intro">Capture the details. We’ll calculate a quote using your service rates.</p><fieldset disabled={saving}><div className="form-row"><label>Customer name<input autoComplete="name" required maxLength={100} value={form.name} onChange={event => setForm({ ...form, name: event.target.value })}/></label><label>Email address<input autoComplete="email" type="email" required maxLength={150} value={form.email} onChange={event => setForm({ ...form, email: event.target.value })}/></label></div><div className="form-row"><label>Service<select value={form.service} onChange={event => setForm({ ...form, service: event.target.value as LeadInput['service'] })}>{services.map(service => <option key={service}>{service}</option>)}</select></label><label>{form.service === 'Office clean' ? 'Estimated hours' : 'Bedrooms'}<input type="number" required min={1} max={20} step={1} value={form.units || ''} onChange={event => setForm({ ...form, units: Number(event.target.value) })}/></label></div><label>Source<select value={form.source} onChange={event => setForm({ ...form, source: event.target.value })}>{['Website form', 'Email', 'Phone', 'Referral', 'Other'].map(source => <option key={source}>{source}</option>)}</select></label><label>Job notes <span className="optional">(optional)</span><textarea rows={3} maxLength={2000} value={form.notes} onChange={event => setForm({ ...form, notes: event.target.value })}/></label><div className="form-estimate"><span>Quote total<small>{state.settings.taxPercent}% tax included</small></span><strong>{money(Math.round(state.settings.rates[form.service] * form.units * 100) / 100 + Math.round(state.settings.rates[form.service] * form.units * state.settings.taxPercent) / 100)}</strong></div>{(formError || error) && <p className="form-error" role="alert">{formError || error}</p>}<div className="modal-actions"><button type="button" className="btn secondary" onClick={() => setCreating(false)}>Cancel</button><button className="btn primary" type="submit">{saving ? 'Saving…' : 'Save enquiry'}<ArrowRight size={16}/></button></div></fieldset></form></AppDialog>
    <CustomerRecord lead={selected} businessName={session.workspace.name} activity={state.activity.filter(item => item.leadId === selectedId)} saving={saving} error={error} onClose={() => setSelectedId(null)} onAction={async action => { const ok = await mutate(current => transition(current, selectedId!, action)); if (ok) setNotice('Customer record updated.'); return ok; }}/>
  </div>;
}

function PricingAndRules({ state, saving, mutate }: { state: State; saving: boolean; mutate: (change: (state: State) => State) => Promise<boolean> }) {
  const [settings, setSettings] = useState(state.settings);
  const [baseSettings, setBaseSettings] = useState(state.settings);
  const [message, setMessage] = useState('');
  const changedElsewhere = JSON.stringify(baseSettings) !== JSON.stringify(state.settings);
  async function save(event: FormEvent) {
    event.preventDefault(); setMessage('');
    if (await mutate(current => {
      if (JSON.stringify(current.settings) !== JSON.stringify(baseSettings)) throw new Error('Pricing changed while you were editing. Load the latest pricing before saving.');
      return { ...current, settings };
    })) { setBaseSettings(settings); setMessage('Pricing saved. Existing quotes keep their agreed amounts.'); }
  }
  if (changedElsewhere) return <section className="panel team-panel"><h2>Pricing has been updated.</h2><p>A teammate changed these settings while this screen was open. Load the latest pricing to continue. This replaces any unsaved pricing draft.</p><button className="btn secondary" onClick={() => { setSettings(state.settings); setBaseSettings(state.settings); setMessage(''); }}>Load latest pricing<RefreshCw size={16}/></button></section>;
  return <><section className="live-rule-list">{([{ key: 'draftQuote', title: 'Prepare quotes', description: 'Calculate a quote from your rates when an enquiry arrives.' }, { key: 'followup', title: 'Prepare a follow-up', description: `Create one draft after ${state.settings.followupHours} hours without a reply.` }, { key: 'invoice', title: 'Prepare invoices', description: 'Create an invoice when your team records customer acceptance.' }] as const).map(rule => <article className="panel live-rule" key={rule.key}><span className="rule-icon"><Workflow size={23}/></span><div><h2>{rule.title}</h2><p>{rule.description}</p></div><button disabled={saving} className={`switch ${state.rules[rule.key] ? 'on' : ''}`} role="switch" aria-checked={state.rules[rule.key]} aria-label={rule.title} onClick={() => mutate(current => setRule(current, rule.key, !current.rules[rule.key]))}><i/></button></article>)}</section><section className="panel"><div className="panel-heading"><div><h2>Service pricing</h2><p>Rates in CAD. Changes apply to new enquiries.</p></div><Settings2 size={20}/></div><form className="live-pricing" onSubmit={save}><fieldset disabled={saving}><div className="pricing-grid">{services.map(service => <label key={service}>{service}<span className="price-input"><span>$</span><input type="number" required min={0.01} max={10000} step={0.01} value={settings.rates[service] || ''} onChange={event => setSettings({ ...settings, rates: { ...settings.rates, [service]: Number(event.target.value) } })}/></span><small>per {service === 'Office clean' ? 'hour' : 'bedroom'}</small></label>)}</div><div className="live-settings-row"><label>Tax (%)<input type="number" required min={0} max={100} step={0.01} value={settings.taxPercent} onChange={event => setSettings({ ...settings, taxPercent: Number(event.target.value) })}/></label><label>Follow-up delay (hours)<input type="number" required min={1} max={720} step={1} value={settings.followupHours} onChange={event => setSettings({ ...settings, followupHours: Number(event.target.value) })}/></label><button className="btn primary" type="submit">{saving ? 'Saving…' : 'Save pricing'}</button></div>{message && <p className="settings-success" role="status">{message}</p>}</fieldset></form></section><div className="live-info"><Workflow size={19}/><p>Rules prepare drafts for your review. Follow-ups are checked when your workspace loads or refreshes. Email delivery and payment collection are handled outside DoneKite.</p></div></>;
}

function Team({ session }: { session: Session }) {
  const [email, setEmail] = useState(''); const [url, setUrl] = useState(''); const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [copied, setCopied] = useState(false);
  async function invite(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(''); setUrl(''); setCopied(false);
    try { const response = await fetch('/api/invitations', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, workspaceId: session.workspace.id }) }); const data = await response.json() as { error?: string; token?: string }; if (!response.ok || !data.token) throw new Error(data.error || 'Could not create invitation.'); setUrl(`${window.location.origin}/?invite=${encodeURIComponent(data.token)}`); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not create invitation.'); } finally { setBusy(false); }
  }
  return <div className="team-layout"><section className="panel team-panel"><span className="workspace-icon"><Users size={23}/></span><h2>One workspace. A shared view.</h2><p>Teammates can view and update enquiries, quotes, invoices, and pricing. Only the owner can invite people.</p><div className="team-person"><span className="live-avatar">{session.user.name.slice(0, 1)}</span><div><strong>{session.user.name} <span>(you)</span></strong><small>{session.user.email}</small></div><span className="subtle-tag">{session.workspace.role}</span></div></section><section className="panel team-panel"><h2>Invite a teammate</h2><p>Create a personal invitation link and share it with your teammate. Links expire after seven days and can be used once.</p>{session.workspace.role === 'owner' ? <form className="live-form" onSubmit={invite}><label>Teammate’s email<input type="email" required maxLength={150} value={email} onChange={event => setEmail(event.target.value)} placeholder="colleague@business.com"/></label><button className="btn primary" disabled={busy} type="submit">{busy ? 'Creating…' : 'Create invitation'}<ArrowRight size={16}/></button></form> : <p className="live-info">Ask your workspace owner to invite teammates.</p>}{error && <p className="form-error" role="alert">{error}</p>}{url && <div className="invite-result"><label>Invitation link<input readOnly value={url} onFocus={event => event.target.select()}/></label><button className="btn secondary" onClick={async () => { try { await navigator.clipboard.writeText(url); setCopied(true); } catch { setError('Select and copy the invitation link above.'); } }}>{copied ? 'Copied' : 'Copy link'}</button><p role="status">Share this link with {email}. No email has been sent.</p></div>}</section></div>;
}
