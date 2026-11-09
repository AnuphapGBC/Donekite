'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { ArrowRight, ArrowUpRight, Check, ChevronRight, Download, FileText, Inbox, LayoutDashboard, LogOut, Menu, Plus, RefreshCw, Search, Users, Workflow, X } from 'lucide-react';
import type { Session } from './auth-screen';
import { AppDialog } from './app-dialog';
import { CustomerRecord } from './customer-record';
import { EnquiryForm } from './enquiry-form';
import { WorkspaceSettings } from './workspace-settings';
import { ThemeToggle } from './theme-provider';
import { FollowupStatus } from './followup-status';
import { getFollowup, selectEnquiries, type EnquirySort, type FollowupFilter } from '@/lib/enquiry-list';
import { formatQuantity, getIndustry } from '@/lib/industries';
import { useServerWorkspace } from '@/hooks/use-server-workspace';
import { addLead, exportCsv, money, total, transition, updateLead, type LeadInput, type Status } from '@/lib/automation';

type View = 'overview' | 'enquiries' | 'automations' | 'team';
const navigation = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'enquiries', label: 'Enquiries', icon: Inbox },
  { id: 'automations', label: 'Rules & pricing', icon: Workflow },
  { id: 'team', label: 'Your team', icon: Users },
] as const;
const labels: Record<Status, string> = { Draft: 'Quote draft', Quoted: 'Awaiting reply', Accepted: 'Accepted', Invoiced: 'Invoice ready', Paid: 'Paid', Closed: 'Closed' };

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
  const [status, setStatus] = useState<Status | 'All'>('All');
  const [followupFilter, setFollowupFilter] = useState<FollowupFilter>('all');
  const [sort, setSort] = useState<EnquirySort>('newest');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [notice, setNotice] = useState('');
  const [signingOut, setSigningOut] = useState(false);
  const [switching, setSwitching] = useState(false);
  const selected = state.leads.find(lead => lead.id === selectedId) ?? null;
  const open = state.leads.filter(lead => !['Paid', 'Closed'].includes(lead.status));
  const followups = state.leads.filter(lead => ['due', 'ready'].includes(getFollowup(lead, state.settings, state.now, state.rules.followup).status));
  const invoices = state.leads.filter(lead => lead.status === 'Invoiced');
  const filtered = selectEnquiries(state, { query, status, followup: followupFilter, sort });
  const hasFilters = !!query.trim() || status !== 'All' || followupFilter !== 'all';

  function clearFilters() { setQuery(''); setStatus('All'); setFollowupFilter('all'); }

  function navigate(next: View) { setView(next); setMenuOpen(false); setNotice(''); }
  async function capture(input: LeadInput) {
    clearError();
    let createdId: string | undefined;
    const ok = await mutate(current => {
      const result = addLead(current, input);
      if (result.error) throw new Error(result.error);
      createdId = result.id;
      return result.state;
    });
    if (ok) { setCreating(false); setSelectedId(createdId ?? null); setNotice('Enquiry saved. Your quote is ready to review.'); }
    return ok;
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
  const table = (items = filtered) => <div className="table-scroll"><table className="lead-table live-table"><caption className="sr-only">Customer enquiries and their next step</caption><thead><tr><th>Customer</th><th>Service</th><th>Status</th><th>Follow-up</th><th className="right">Total CAD</th><th><span className="sr-only">Open record</span></th></tr></thead><tbody>
    {items.map(lead => <tr key={lead.id}><td><button className="customer" onClick={() => setSelectedId(lead.id)}><span className="live-avatar">{lead.name.slice(0, 1).toUpperCase()}</span><span><strong>{lead.name}</strong><small>{lead.email}</small></span></button></td><td>{lead.service}<small>{formatQuantity(lead)}</small></td><td><span className={`badge badge-${lead.status.toLowerCase()}`}>{labels[lead.status]}</span></td><td className="followup-cell"><FollowupStatus followup={getFollowup(lead, state.settings, state.now, state.rules.followup)}/></td><td className="right">{money(total(lead))}</td><td><button className="icon-button" aria-label={`Open ${lead.name}`} onClick={() => setSelectedId(lead.id)}><ArrowUpRight size={18}/></button></td></tr>)}
  </tbody></table>{!items.length && <div className="live-empty"><Inbox size={30}/><h3>{state.leads.length ? 'No matching enquiries' : 'Your next customer starts here.'}</h3><p>{state.leads.length ? 'Try another search or adjust the status and follow-up filters.' : 'Add an enquiry to prepare a quote and keep every next step together.'}</p>{state.leads.length ? <button className="btn secondary" onClick={clearFilters}>Clear filters</button> : createButton}</div>}</div>;

  return <div className="app-shell live-app"><a className="skip-link" href="#workspace-content">Skip to content</a>
    {menuOpen && <button className="mobile-scrim" onClick={() => setMenuOpen(false)} aria-label="Close navigation"/>}
    <aside className={`sidebar ${menuOpen ? 'mobile-open' : ''}`}>
      <Link className="app-wordmark" href="/">donekite<span>.</span></Link>
      <div className="workspace"><span className="workspace-icon"><Workflow size={20}/></span><div><strong>{session.workspace.name}</strong><small>{getIndustry(state.settings.industry).label}</small></div></div>
      {(session.workspaces?.length ?? 0) > 1 && <select className="workspace-switch" aria-label="Switch workspace" value={session.workspace.id} disabled={saving || switching} onChange={event => switchWorkspace(event.target.value)}>{session.workspaces!.map(workspace => <option key={workspace.id} value={workspace.id}>{workspace.name}</option>)}</select>}
      <p className="nav-label">WORKSPACE</p><nav aria-label="Main navigation">{navigation.map(({ id, label, icon: Icon }) => <button key={id} className={`nav-item ${view === id ? 'active' : ''}`} aria-current={view === id ? 'page' : undefined} onClick={() => navigate(id)}><Icon size={19}/>{label}{id === 'enquiries' && <span className="nav-count">{open.length}</span>}</button>)}</nav>
      <div className="sidebar-bottom"><div className="workspace-help"><span>GETTING STARTED</span><p>A clear path from enquiry to payment.</p><a href="/demo" target="_blank" rel="noreferrer">Explore the guided demo <ArrowUpRight size={14}/></a></div><div className="live-profile"><span className="live-avatar">{session.user.name.slice(0, 1)}</span><div><strong>{session.user.name}</strong><small>{session.workspace.role === 'owner' ? 'Workspace owner' : 'Team member'}</small></div><button className="icon-button" disabled={signingOut || saving} onClick={signOut} aria-label="Sign out"><LogOut size={17}/></button></div></div>
    </aside>
    <div className="main-shell"><header className="topbar"><div className="breadcrumb"><button className="mobile-menu icon-button" onClick={() => setMenuOpen(!menuOpen)} aria-label="Toggle navigation" aria-expanded={menuOpen}><Menu size={21}/></button><span>{session.workspace.name}</span><ChevronRight size={14}/><strong>{navigation.find(item => item.id === view)?.label}</strong></div><div className="top-actions"><ThemeToggle/><span className={`save-status ${!connected ? 'offline' : ''}`} role="status"><span/>{saving ? 'Saving…' : connected ? 'Connected' : 'Connection interrupted'}</span><button className="icon-button" onClick={refresh} disabled={saving} aria-label="Refresh workspace"><RefreshCw size={17}/></button></div></header>
      <main id="workspace-content" tabIndex={-1}>
        <div className="page-heading"><div><p className="eyebrow">{new Intl.DateTimeFormat('en-CA', { weekday: 'long', month: 'long', day: 'numeric' }).format(new Date())}</p><h1>{view === 'overview' ? 'A little less busywork.' : view === 'enquiries' ? 'Every enquiry, in one place.' : view === 'automations' ? 'Set your work in motion.' : 'Better, together.'}</h1><p className="page-description">{view === 'overview' ? 'A clear view of your customers and what comes next.' : view === 'enquiries' ? 'From the first hello to a paid invoice. Keep the details together.' : view === 'automations' ? 'Set your rates and choose which drafts DoneKite prepares.' : 'Invite the people who help you keep things moving.'}</p></div>{view !== 'team' && createButton}</div>
        {error && <div className="app-alert" role="alert">{error}<button className="icon-button" aria-label="Dismiss error" onClick={clearError}><X size={17}/></button></div>}
        {notice && <div className="app-notice" role="status">{notice}<button className="icon-button" onClick={() => setNotice('')} aria-label="Dismiss notice"><X size={17}/></button></div>}
        {!connected && <div className="app-alert">Unable to refresh records. Reconnect before making changes.<button className="link-button" onClick={refresh}>Try again</button></div>}
        {view === 'overview' && <>
          <section className="live-welcome"><div><span className="section-kicker">YOUR BUSINESS, WITH A LITTLE MORE FLOW</span><h2>Good work starts<br/>with a clear next step.</h2><p>{open.length ? `${open.length} open ${open.length === 1 ? 'enquiry needs' : 'enquiries need'} your attention. Let’s keep things moving.` : 'Your workspace is ready. Capture your first enquiry and let the details fall into place.'}</p><button className="btn dark" onClick={() => open.length ? navigate('enquiries') : setCreating(true)}>{open.length ? 'View your enquiries' : 'Add your first enquiry'}<ArrowRight size={17}/></button></div><div className="live-flow">{[{ icon: Inbox, name: 'Enquiry captured', sub: 'The details, all together' }, { icon: FileText, name: 'Quote prepared', sub: 'Your pricing. Your approval.' }, { icon: Check, name: 'Job well done', sub: 'An invoice and a clear record' }].map(({ icon: Icon, name, sub }, index) => <div key={name}><span className="live-flow-number">0{index + 1}</span><Icon size={21}/><span><strong>{name}</strong><small>{sub}</small></span><Check size={15}/></div>)}</div></section>
          <section className="stats-grid live-stats" aria-label="Business summary">{[{ label: 'Open enquiries', value: open.length, note: 'Ready for the next step' }, { label: 'Open quote value', value: money(open.reduce((sum, lead) => sum + lead.amount, 0)), note: 'Before tax · CAD' }, { label: 'Follow-ups to review', value: followups.length, note: 'Drafts ready or due' }, { label: 'Outstanding invoices', value: money(invoices.reduce((sum, lead) => sum + total(lead), 0)), note: `${invoices.length} awaiting payment` }].map(metric => <article className="stat" key={metric.label}><div className="stat-label">{metric.label}</div><strong>{metric.value}</strong><p>{metric.note}</p>{metric.label === 'Follow-ups to review' && <button className="link-button metric-link" onClick={() => { clearFilters(); setFollowupFilter('attention'); navigate('enquiries'); }}>Review follow-ups<ArrowRight size={14}/></button>}</article>)}</section>
          <div className="dashboard-grid"><section className="panel"><div className="panel-heading"><div><h2>Recent enquiries</h2><p>Small details. Clear next steps.</p></div><button className="link-button" onClick={() => navigate('enquiries')}>View all<ArrowUpRight size={15}/></button></div>{table(state.leads.slice(0, 5))}</section><section className="panel"><div className="panel-heading"><div><h2>Latest activity</h2><p>A shared record of your team’s work.</p></div></div><div className="live-activity">{state.activity.slice(0, 6).map(item => <div key={item.id}><span className="activity-icon"><Workflow size={16}/></span><div>{item.leadId ? <button onClick={() => setSelectedId(item.leadId!)}>{item.title}</button> : <strong>{item.title}</strong>}<p>{item.detail}</p><small>{new Date(item.at).toLocaleString('en-CA', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</small></div></div>)}{!state.activity.length && <div className="quiet-empty">Your first enquiry starts the story. Activity will appear here as your team works.</div>}</div></section></div>
        </>}
        {view === 'enquiries' && <section className="panel">
          <div className="table-toolbar enquiry-toolbar">
            <div className="search-field"><Search size={18}/><input aria-label="Search enquiries" placeholder="Search customer, job details, or notes…" value={query} onChange={event => setQuery(event.target.value)}/></div>
            <label className="enquiry-filter">Status<select className="live-select" value={status} onChange={event => setStatus(event.target.value as Status | 'All')}><option value="All">All statuses</option>{Object.entries(labels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
            <label className="enquiry-filter">Follow-up<select className="live-select" value={followupFilter} onChange={event => setFollowupFilter(event.target.value as FollowupFilter)}><option value="all">All follow-ups</option><option value="attention">Ready or due</option><option value="scheduled">Scheduled</option><option value="paused">Paused</option></select></label>
            <label className="enquiry-filter">Sort by<select className="live-select" value={sort} onChange={event => setSort(event.target.value as EnquirySort)}><option value="newest">Newest first</option><option value="oldest">Oldest first</option><option value="customer">Customer A–Z</option><option value="amount-high">Highest total</option><option value="amount-low">Lowest total</option></select></label>
            <button className="btn secondary" disabled={!filtered.length} onClick={() => downloadFile(exportCsv(filtered), 'donekite-enquiries.csv', 'text/csv;charset=utf-8;')}><Download size={16}/>Export CSV</button>
          </div>
          <div className="enquiry-filter-summary"><p role="status">Showing {filtered.length} of {state.leads.length} enquiries</p>{hasFilters && <button className="link-button" onClick={clearFilters}>Clear filters<X size={14}/></button>}</div>
          {table()}<div className="panel-footer">CSV includes the current filtered list<span>Amounts include tax · CAD</span></div>
        </section>}
        {view === 'automations' && <WorkspaceSettings state={state} saving={saving} mutate={mutate} error={error}/>}
        {view === 'team' && <Team session={session}/>}
        <footer className="live-footer"><span>donekite · Less admin, more business.</span><span>Shared records · Your team stays in control</span></footer>
      </main>
    </div>
    <AppDialog open={creating} onClose={() => !saving && setCreating(false)} title="New enquiry">{creating && <EnquiryForm state={state} saving={saving} error={error} onSubmit={capture} onCancel={() => setCreating(false)}/>}</AppDialog>
    <CustomerRecord lead={selected} businessName={session.workspace.name} activity={state.activity.filter(item => item.leadId === selectedId)} saving={saving} error={error} followup={selected ? getFollowup(selected, state.settings, state.now, state.rules.followup) : undefined} onCheckFollowup={refresh} onClose={() => setSelectedId(null)} onAction={async action => { const ok = await mutate(current => transition(current, selectedId!, action)); if (ok) setNotice('Customer record updated.'); return ok; }} onEdit={async (input, expected) => {
      const ok = await mutate(current => {
        const result = updateLead(current, selectedId!, input, expected);
        if (result.error) throw new Error(result.error);
        return result.state;
      });
      if (ok) setNotice('Enquiry details saved.');
      return ok;
    }}/>
  </div>;
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
