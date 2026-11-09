'use client';

import { useState, type FormEvent } from 'react';
import { Plus, RefreshCw, Settings2, Trash2, Workflow } from 'lucide-react';
import { setRule, type Settings, type State } from '@/lib/automation';
import { createIndustrySettings, getCatalog, getIndustry, getServiceRate, industries, type IndustryId, type ServiceDefinition } from '@/lib/industries';

type Props = {
  state: State;
  saving: boolean;
  error?: string;
  mutate: (change: (state: State) => State) => Promise<boolean>;
};

function editableSettings(settings: Settings): Settings {
  const catalog = getCatalog(settings).map(service => ({ ...service }));
  return { ...settings, industry: getIndustry(settings.industry).id, catalog, rates: Object.fromEntries(catalog.map(service => [service.id, getServiceRate(settings, service)])) };
}

// PostgreSQL JSONB can return object keys in a different order. Compare the
// editable values in a fixed order so a successful save is not a conflict.
function settingsSignature(settings: Settings) {
  return JSON.stringify([
    getIndustry(settings.industry).id, settings.taxPercent, settings.followupHours,
    getCatalog(settings).map(service => [service.id, service.name, service.unit, service.unitPlural, service.maxUnits, service.step, service.defaultRate, getServiceRate(settings, service)]),
  ]);
}

export function WorkspaceSettings({ state, saving, error, mutate }: Props) {
  const [settings, setSettings] = useState(() => editableSettings(state.settings));
  const [baseline, setBaseline] = useState(state.settings);
  const [message, setMessage] = useState('');
  const [formError, setFormError] = useState('');
  const [templateChanged, setTemplateChanged] = useState(false);
  const changedElsewhere = settingsSignature(baseline) !== settingsSignature(state.settings);
  const industry = getIndustry(settings.industry);
  const catalog = getCatalog(settings);
  const dirty = settingsSignature(settings) !== settingsSignature(baseline);

  function updateService(id: string, change: Partial<ServiceDefinition>) {
    setMessage('');
    setSettings(current => ({ ...current, catalog: getCatalog(current).map(service => service.id === id ? { ...service, ...change } : service) }));
  }

  function loadLatest() {
    setSettings(editableSettings(state.settings));
    setBaseline(state.settings);
    setMessage(''); setFormError(''); setTemplateChanged(false);
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    setMessage(''); setFormError('');
    const services = catalog.map(service => ({ ...service, name: service.name.trim(), unit: service.unit.trim(), unitPlural: service.unitPlural.trim() }));
    if (services.some(service => !service.name || !service.unit || !service.unitPlural)) {
      setFormError('Enter a name and both quantity labels for every service.'); return;
    }
    if (new Set(services.map(service => service.name.toLowerCase())).size !== services.length) {
      setFormError('Give each service a different name so customers can tell them apart.'); return;
    }
    if (services.some(service => !Number.isFinite(service.maxUnits) || service.maxUnits < 1 || service.maxUnits > 1000000 || !Number.isFinite(service.step) || service.step < 0.01 || service.step > service.maxUnits)) {
      setFormError('Set a maximum quantity from 1 to 1,000,000 and a quantity increment from 0.01 up to that maximum.'); return;
    }
    const next: Settings = { ...settings, catalog: services, rates: Object.fromEntries(services.map(service => [service.id, getServiceRate(settings, service)])) };
    if (await mutate(current => {
      if (settingsSignature(current.settings) !== settingsSignature(baseline)) throw new Error('Your industry or pricing changed while you were editing. Load the latest settings before saving.');
      return { ...current, settings: next };
    })) {
      setSettings(next); setBaseline(next); setTemplateChanged(false);
      setMessage('Settings saved. Existing enquiries keep their service details and agreed amounts.');
    }
  }

  return <>
    <section className="live-rule-list" aria-label="Automation rules">{([
      { key: 'draftQuote', title: 'Prepare quotes', description: 'Calculate a quote from your rates when an enquiry arrives.' },
      { key: 'followup', title: 'Prepare a follow-up', description: `Create one draft after ${state.settings.followupHours} hours without a reply.` },
      { key: 'invoice', title: 'Prepare invoices', description: 'Create an invoice when your team records customer acceptance.' },
    ] as const).map(rule => <article className="panel live-rule" key={rule.key}><span className="rule-icon"><Workflow size={23}/></span><div><h2>{rule.title}</h2><p>{rule.description}</p></div><button type="button" disabled={saving} className={`switch ${state.rules[rule.key] ? 'on' : ''}`} role="switch" aria-checked={state.rules[rule.key]} aria-label={rule.title} onClick={() => mutate(current => setRule(current, rule.key, !current.rules[rule.key]))}><i/></button></article>)}</section>
    {changedElsewhere ? <section className="panel team-panel"><h2>Settings have been updated.</h2><p>A teammate changed your industry or pricing while this screen was open. Load the latest settings to continue. This replaces your unsaved draft.</p><button type="button" className="btn secondary" disabled={saving} onClick={loadLatest}>Load latest settings<RefreshCw size={16}/></button></section> : <section className="panel industry-settings">
      <div className="panel-heading"><div><h2>Industry & service pricing</h2><p>Choose your enquiry questions and set prices in CAD.</p></div><Settings2 size={20}/></div>
      <form className="live-pricing live-form" onSubmit={save}>
        <fieldset disabled={saving}>
          <div className="industry-template">
            <label>Business industry<select value={industry.id} onChange={event => {
              setSettings(editableSettings(createIndustrySettings(event.target.value as IndustryId, settings)));
              setMessage(''); setFormError(''); setTemplateChanged(true);
            }}>{industries.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
            <p>{industry.description}</p>
            <p className="industry-template-note">Changing industry loads its starter services and enquiry questions. Review the rates, then save to use them for new enquiries.</p>
            {templateChanged && <p className="industry-draft-note" role="status">Industry template loaded into your draft. Existing enquiries keep their original details and prices.</p>}
            <div className="industry-question-preview"><strong>Enquiry questions</strong><ul>{industry.fields.map(field => <li key={field.id}>{field.label}{field.required ? ' · required' : ''}</li>)}</ul></div>
          </div>
          <div className="industry-service-heading"><div><h3>Your services</h3><p>Customize service names and the units you charge for.</p></div><span>{catalog.length} / 24</span></div>
          <div className="industry-service-list">{catalog.map((service, index) => <div className="industry-service" key={service.id}>
            <div className="industry-service-title"><strong>Service {index + 1}</strong><button type="button" className="icon-button" disabled={catalog.length <= 1} aria-label={`Remove ${service.name || `service ${index + 1}`}`} onClick={() => {
              setMessage('');
              setSettings(current => ({ ...current, catalog: getCatalog(current).filter(item => item.id !== service.id), rates: Object.fromEntries(Object.entries(current.rates).filter(([id]) => id !== service.id)) }));
            }}><Trash2 size={17}/></button></div>
            <div className="industry-service-fields">
              <label className="industry-service-name">Service name<input required maxLength={100} value={service.name} onChange={event => updateService(service.id, { name: event.target.value })}/></label>
              <label>Rate (CAD)<input type="number" required min={0.01} max={10000} step={0.01} value={getServiceRate(settings, service) || ''} onChange={event => { setMessage(''); setSettings({ ...settings, rates: { ...settings.rates, [service.id]: Number(event.target.value) } }); }}/></label>
              <label>Unit, singular<input required maxLength={40} value={service.unit} placeholder="hour" onChange={event => updateService(service.id, { unit: event.target.value })}/></label>
              <label>Unit, plural<input required maxLength={40} value={service.unitPlural} placeholder="hours" onChange={event => updateService(service.id, { unitPlural: event.target.value })}/></label>
              <label>Maximum quantity<input type="number" required min={1} max={1000000} step={0.01} value={service.maxUnits || ''} onChange={event => updateService(service.id, { maxUnits: Number(event.target.value) })}/></label>
              <label>Quantity increment<input type="number" required min={0.01} max={service.maxUnits} step={0.01} value={service.step || ''} onChange={event => updateService(service.id, { step: Number(event.target.value) })}/><small className="industry-quantity-help">Use 1 for whole units or 0.25 for quarter-hours.</small></label>
            </div>
          </div>)}</div>
          <div className="industry-add-service"><button type="button" className="btn secondary" disabled={catalog.length >= 24} onClick={() => {
            const service: ServiceDefinition = { id: crypto.randomUUID(), name: '', unit: 'job', unitPlural: 'jobs', maxUnits: 1000, step: 1, defaultRate: 100 };
            setMessage('');
            setSettings(current => ({ ...current, catalog: [...getCatalog(current), service], rates: { ...current.rates, [service.id]: service.defaultRate } }));
          }}><Plus size={16}/>Add service</button><small>Keep at least one service. Add up to 24.</small></div>
          <div className="live-settings-row industry-settings-footer">
            <label>Tax (%)<input type="number" required min={0} max={100} step={0.01} value={settings.taxPercent} onChange={event => { setMessage(''); setSettings({ ...settings, taxPercent: Number(event.target.value) }); }}/></label>
            <label>Follow-up delay (hours)<input type="number" required min={1} max={720} step={1} value={settings.followupHours} onChange={event => { setMessage(''); setSettings({ ...settings, followupHours: Number(event.target.value) }); }}/></label>
            <div className="industry-save"><span>{dirty ? 'Unsaved changes' : 'Settings up to date'}</span><button className="btn primary" type="submit">{saving ? 'Saving…' : 'Save settings'}</button></div>
          </div>
          {(formError || error) && <p className="form-error industry-settings-message" role="alert">{formError || error}</p>}
          {message && <p className="settings-success" role="status">{message}</p>}
        </fieldset>
      </form>
    </section>}
    <div className="live-info"><Workflow size={19}/><p>Rules prepare drafts for your review. Follow-ups are checked when your workspace loads or refreshes. Email delivery and payment collection are handled outside DoneKite.</p></div>
  </>;
}
