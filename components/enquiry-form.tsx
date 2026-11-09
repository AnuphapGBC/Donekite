'use client';

import { useState, type FormEvent } from 'react';
import { ArrowRight } from 'lucide-react';
import { money, type LeadInput, type State } from '@/lib/automation';
import { getCatalog, getIndustry, getServiceRate, type IndustryId, type ServiceDefinition } from '@/lib/industries';

type Props = {
  state: State;
  saving: boolean;
  error?: string;
  onSubmit: (input: LeadInput) => Promise<boolean>;
  onCancel: () => void;
};

type EnquiryDraft = {
  name: string;
  email: string;
  source: string;
  notes: string;
  industry: IndustryId;
  serviceId: string;
  units: string;
  details: Record<string, string>;
};

function initialQuantity(service: ServiceDefinition) {
  const increments = Math.min(Math.floor(service.maxUnits / service.step + 1e-8), Math.max(1, Math.ceil(1 / service.step - 1e-8)));
  return String(Number((increments * service.step).toFixed(8)));
}

export function EnquiryForm({ state, saving, error, onSubmit, onCancel }: Props) {
  const industry = getIndustry(state.settings.industry);
  const catalog = getCatalog(state.settings);
  const firstService = catalog[0];
  const [form, setForm] = useState<EnquiryDraft>(() => ({
    name: '', email: '', source: 'Website form', notes: '',
    industry: industry.id, serviceId: firstService.id,
    units: initialQuantity(firstService), details: {},
  }));
  const service = catalog.find(item => item.id === form.serviceId) ?? firstService;

  // A teammate can change the template while this dialog is open. Keep the
  // customer details, and start the new service scope with valid quantities.
  if (form.industry !== industry.id || !catalog.some(item => item.id === form.serviceId)) {
    setForm({ ...form, industry: industry.id, serviceId: firstService.id, units: initialQuantity(firstService), details: form.industry === industry.id ? form.details : {} });
  }

  const quantity = Number(form.units);
  const rate = getServiceRate(state.settings, service);
  const subtotal = Math.round(rate * quantity * 100) / 100;
  const tax = Math.round(subtotal * state.settings.taxPercent) / 100;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    await onSubmit({
      name: form.name, email: form.email, source: form.source, notes: form.notes,
      service: service.name, serviceId: service.id, units: quantity, details: form.details,
    });
  }

  return <form className="enquiry-form live-form industry-enquiry" onSubmit={submit}>
    <p className="modal-intro">Add the customer and job details. Your service rates calculate the quote.</p>
    <fieldset disabled={saving}>
      <div className="form-row">
        <label>Customer name<input autoComplete="name" required maxLength={100} value={form.name} onChange={event => setForm({ ...form, name: event.target.value })}/></label>
        <label>Email address<input autoComplete="email" type="email" required maxLength={150} value={form.email} onChange={event => setForm({ ...form, email: event.target.value })}/></label>
      </div>
      <div className="form-row">
        <label>Service<select value={service.id} onChange={event => {
          const next = catalog.find(item => item.id === event.target.value)!;
          setForm({ ...form, serviceId: next.id, units: initialQuantity(next) });
        }}>{catalog.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <label>Quantity ({service.unitPlural})<input type="number" required min={service.step} max={service.maxUnits} step={service.step} value={form.units} onChange={event => setForm({ ...form, units: event.target.value })}/><small className="industry-field-help">{money(rate)} per {service.unit} · up to {service.maxUnits.toLocaleString('en-CA')} {service.unitPlural}</small></label>
      </div>
      <div className="industry-details">
        <h3>{industry.label} details</h3>
        <div className="industry-detail-grid">
          {industry.fields.map(field => <label key={field.id}>{field.label}{!field.required && <span className="optional"> (optional)</span>}
            {field.type === 'select' ? <select required={field.required} value={form.details[field.id] ?? ''} onChange={event => setForm({ ...form, details: { ...form.details, [field.id]: event.target.value } })}>
              <option value="">Choose {field.label.toLowerCase()}</option>
              {field.options?.map(option => <option key={option} value={option}>{option}</option>)}
            </select> : <input type={field.type} required={field.required} maxLength={field.type === 'text' ? 500 : undefined} min={field.type === 'number' ? 0.01 : undefined} max={field.type === 'number' ? 1000000 : undefined} step={field.type === 'number' ? 'any' : undefined} placeholder={field.placeholder} value={form.details[field.id] ?? ''} onChange={event => setForm({ ...form, details: { ...form.details, [field.id]: event.target.value } })}/>}
          </label>)}
        </div>
      </div>
      <label>Source<select value={form.source} onChange={event => setForm({ ...form, source: event.target.value })}>{['Website form', 'Email', 'Phone', 'Referral', 'Other'].map(source => <option key={source}>{source}</option>)}</select></label>
      <label>Job notes <span className="optional">(optional)</span><textarea rows={3} maxLength={2000} value={form.notes} onChange={event => setForm({ ...form, notes: event.target.value })}/></label>
      <div className="form-estimate"><span>Quote total<small>{state.settings.taxPercent}% tax included · CAD</small></span><strong>{money(Number.isFinite(subtotal + tax) ? subtotal + tax : 0)}</strong></div>
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="modal-actions"><button type="button" className="btn secondary" onClick={onCancel}>Cancel</button><button className="btn primary" type="submit">{saving ? 'Saving…' : 'Save enquiry'}<ArrowRight size={16}/></button></div>
    </fieldset>
  </form>;
}
