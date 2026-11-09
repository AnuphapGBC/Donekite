'use client';

import { useId, useRef, useState, type FormEvent } from 'react';
import { Check, RefreshCw } from 'lucide-react';
import { money, total, type Lead, type LeadEditInput } from '@/lib/automation';
import { formatQuantity, getIndustry } from '@/lib/industries';

type Props = {
  lead: Lead;
  saving: boolean;
  error?: string;
  onSave: (input: LeadEditInput, expected: LeadEditInput) => Promise<boolean>;
  onCancel: () => void;
};

function editableDetails(lead: Lead): LeadEditInput {
  return { name: lead.name, email: lead.email, source: lead.source, notes: lead.notes, details: { ...lead.details } };
}

function detailSignature(input: LeadEditInput) {
  return JSON.stringify([
    input.name.trim(), input.email.trim().toLowerCase(), input.source.trim(), input.notes,
    Object.entries(input.details ?? {}).map(([key, value]) => [key, value.trim()])
      .filter(([, value]) => value).sort(([first], [second]) => first.localeCompare(second)),
  ]);
}

function baselineSignature(input: LeadEditInput) {
  return JSON.stringify([
    input.name, input.email, input.source, input.notes,
    Object.entries(input.details ?? {}).sort(([first], [second]) => first.localeCompare(second)),
  ]);
}

export function EnquiryEditor({ lead, saving, error, onSave, onCancel }: Props) {
  const [draft, setDraft] = useState(() => editableDetails(lead));
  const [baseline, setBaseline] = useState(() => editableDetails(lead));
  const [working, setWorking] = useState(false);
  const [localError, setLocalError] = useState('');
  const submitting = useRef(false);
  const pricingNoteId = useId();
  const industry = getIndustry(lead.industry);
  const busy = saving || working;
  const changedElsewhere = baselineSignature(baseline) !== baselineSignature(editableDetails(lead));
  const dirty = detailSignature(draft) !== detailSignature(baseline);
  const sources = ['Website form', 'Email', 'Phone', 'Referral', 'Other'];
  if (!sources.includes(draft.source)) sources.push(draft.source);

  function update(change: Partial<LeadEditInput>) {
    setLocalError('');
    setDraft(current => ({ ...current, ...change }));
  }

  function loadLatest() {
    const latest = editableDetails(lead);
    setDraft(latest);
    setBaseline(latest);
    setLocalError('');
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || submitting.current || changedElsewhere || !dirty) return;
    submitting.current = true;
    setWorking(true);
    setLocalError('');
    try {
      if (!await onSave(draft, baseline)) setLocalError('Your changes could not be saved. Review the details and try again.');
    } catch (cause) {
      setLocalError(cause instanceof Error ? cause.message : 'Your changes could not be saved. Please try again.');
    } finally {
      submitting.current = false;
      setWorking(false);
    }
  }

  return <form className="enquiry-form live-form enquiry-editor" onSubmit={save} aria-describedby={pricingNoteId}>
    <p className="modal-intro">Update customer information and job details for this enquiry.</p>
    <section className="enquiry-editor-summary" aria-label="Saved service and pricing">
      <dl>
        <div><dt>Service</dt><dd>{lead.service}<small>{industry.label}</small></dd></div>
        <div><dt>Quantity</dt><dd>{formatQuantity(lead)}</dd></div>
        <div><dt>Total CAD</dt><dd>{money(total(lead))}</dd></div>
      </dl>
      <p id={pricingNoteId}>The saved service, quantity, and agreed price stay attached to this enquiry.</p>
    </section>
    {changedElsewhere && <div className="enquiry-editor-conflict" role="status">
      <p>A teammate updated these customer or job details. Load the latest version to continue. This replaces your unsaved changes.</p>
      <button type="button" className="btn secondary" disabled={busy} onClick={loadLatest}><RefreshCw size={16} aria-hidden="true"/>Load latest details</button>
    </div>}
    <fieldset disabled={busy || changedElsewhere}>
      <div className="form-row">
        <label>Customer name<input autoComplete="name" required maxLength={100} value={draft.name} onChange={event => update({ name: event.target.value })}/></label>
        <label>Email address<input type="email" autoComplete="email" required maxLength={150} value={draft.email} onChange={event => update({ email: event.target.value })}/></label>
      </div>
      <section className="enquiry-editor-job" aria-label={`${industry.label} details`}>
        <h3>Job details</h3>
        <div className="enquiry-editor-fields">
          {industry.fields.map(field => <label key={field.id}><span>{field.label}{!field.required && <span className="optional"> (optional)</span>}</span>
            {field.type === 'select' ? <select required={field.required} value={draft.details?.[field.id] ?? ''} onChange={event => update({ details: { ...draft.details, [field.id]: event.target.value } })}>
              <option value="">Choose {field.label.toLowerCase()}</option>
              {field.options?.map(option => <option key={option} value={option}>{option}</option>)}
            </select> : <input type={field.type} required={field.required} maxLength={field.type === 'text' ? 500 : undefined} min={field.type === 'number' ? 0.01 : undefined} max={field.type === 'number' ? 1000000 : undefined} step={field.type === 'number' ? 'any' : undefined} placeholder={field.placeholder} value={draft.details?.[field.id] ?? ''} onChange={event => update({ details: { ...draft.details, [field.id]: event.target.value } })}/>}
          </label>)}
        </div>
      </section>
      <label>Source<select value={draft.source} onChange={event => update({ source: event.target.value })}>{sources.map(source => <option key={source} value={source}>{source}</option>)}</select></label>
      <label><span>Job notes <span className="optional">(optional)</span></span><textarea rows={4} maxLength={2000} value={draft.notes} onChange={event => update({ notes: event.target.value })}/></label>
    </fieldset>
    {(error || localError) && <p className="form-error" role="alert">{error || localError}</p>}
    <div className="modal-actions">
      <button type="button" className="btn secondary" disabled={busy} onClick={onCancel}>Cancel</button>
      <button type="submit" className="btn primary" disabled={busy || changedElsewhere || !dirty}>{busy ? 'Saving…' : 'Save changes'}<Check size={16} aria-hidden="true"/></button>
    </div>
  </form>;
}
