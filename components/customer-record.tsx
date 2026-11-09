'use client';

import {useState} from 'react';
import {ArrowRight,CheckCircle2,Clock,FileText,Mail,Printer,Receipt} from 'lucide-react';
import {AppDialog} from '@/components/app-dialog';
import {money,subtotal,total,type Activity,type Lead} from '@/lib/automation';

type Action='quote'|'accept'|'invoice'|'paid'|'close';
type CustomerRecordProps={
  lead:Lead|null;
  businessName:string;
  activity:Activity[];
  saving:boolean;
  error?:string;
  onClose:()=>void;
  onAction:(action:Action)=>Promise<boolean>;
};

function date(timestamp:number) {
  return new Intl.DateTimeFormat('en-CA',{dateStyle:'medium',timeStyle:'short',timeZone:'America/Toronto'}).format(timestamp);
}
function emailDraft(lead:Lead,businessName:string,kind:'quote'|'followup'|'invoice') {
  const scope=`${lead.units} ${lead.service==='Office clean'?'estimated hours':'bedrooms'}`;
  const subject=kind==='followup'?`Following up on your ${lead.service.toLowerCase()} quote`: `${kind==='invoice'?'Invoice':'Quote'} for ${lead.service.toLowerCase()}`;
  const body=kind==='followup'
    ? `Hi ${lead.name},\n\nJust following up on your ${lead.service.toLowerCase()} quote for ${money(total(lead))} CAD, including tax. Please let us know if you have any questions or would like to arrange the next step.\n\n${businessName}`
    : `Hi ${lead.name},\n\nHere is your ${kind} from ${businessName}.\n\n${lead.service} — ${scope}\nRate: ${money(lead.rate)} CAD per ${lead.service==='Office clean'?'hour':'bedroom'}\nSubtotal: ${money(subtotal(lead))} CAD\nTax: ${money(lead.tax)} CAD\nTotal: ${money(total(lead))} CAD\n\n${kind==='quote'?'Please reply if you would like to accept this quote or discuss the details.':'Please contact us to confirm payment arrangements.'}\n\n${businessName}`;
  return `mailto:${encodeURIComponent(lead.email)}?subject=${encodeURIComponent(`${businessName} — ${subject}`)}&body=${encodeURIComponent(body)}`;
}

function RecordDocument({lead,businessName,invoice}:{lead:Lead;businessName:string;invoice:boolean}) {
  const effectiveTax=lead.amount>0?new Intl.NumberFormat('en-CA',{maximumFractionDigits:2}).format(lead.tax/lead.amount*100):'0';
  return <article className="record-document printable-document" aria-label={invoice?'Invoice document':'Quote document'}>
    <header><div><p className="eyebrow">{invoice?'INVOICE':'SERVICE QUOTE'}</p><h3>{businessName}</h3></div><span className={`badge badge-${lead.status.toLowerCase()}`}>{invoice?(lead.paidAt!==undefined?'Paid':lead.status==='Closed'?'Closed':'Payment not recorded'):lead.status==='Draft'?'Draft':'Quote record'}</span></header>
    <div className="record-document-parties"><div><small>PREPARED FOR</small><strong>{lead.name}</strong><p>{lead.email}</p></div><div><small>{invoice?'INVOICE PREPARED':'ENQUIRY RECEIVED'}</small><p>{date(invoice?lead.invoiceAt!:lead.createdAt)}</p>{!invoice&&lead.quotedAt!==undefined&&<p>Marked sent {date(lead.quotedAt)}</p>}</div></div>
    <div className="table-scroll"><table className="record-document-table"><caption className="sr-only">{invoice?'Invoice':'Quote'} pricing in Canadian dollars</caption><thead><tr><th>Service</th><th>Units</th><th>Rate</th><th>Amount</th></tr></thead><tbody><tr><td>{lead.service}<small>{lead.service==='Office clean'?'Estimated hours':'Bedrooms'}</small></td><td>{lead.units}</td><td>{money(lead.rate)}</td><td>{money(subtotal(lead))}</td></tr></tbody></table></div>
    <dl className="record-totals"><div><dt>Subtotal</dt><dd>{money(subtotal(lead))}</dd></div><div><dt>Tax ({effectiveTax}% effective)</dt><dd>{money(lead.tax)}</dd></div><div className="record-total"><dt>Total <small>CAD</small></dt><dd>{money(total(lead))}</dd></div></dl>
    <p className="record-note">Pricing is saved with this enquiry. Changes to service rates do not change this document.</p>
    {invoice&&lead.paidAt!==undefined&&<p className="record-payment"><CheckCircle2 size={17} aria-hidden="true"/>Payment recorded {date(lead.paidAt)}.</p>}
    {invoice&&lead.status==='Closed'&&lead.paidAt===undefined&&<p className="record-note">This enquiry is closed. No payment has been recorded.</p>}
  </article>;
}

function RecordDetails({lead,businessName,activity,saving,error,onAction}:Omit<CustomerRecordProps,'lead'|'onClose'>&{lead:Lead}) {
  const [tab,setTab]=useState<'details'|'quote'|'invoice'|'history'>('details');
  const [confirmClose,setConfirmClose]=useState(false);
  const [working,setWorking]=useState(false);
  const [actionError,setActionError]=useState('');
  const busy=saving||working;
  const history=activity.filter(item=>item.leadId===lead.id).toSorted((a,b)=>b.at-a.at);
  const nextAction:Exclude<Action,'close'>|null=lead.status==='Draft'?'quote':lead.status==='Quoted'?'accept':lead.status==='Accepted'?'invoice':lead.status==='Invoiced'?'paid':null;
  const actionLabels={quote:'Mark quote sent',accept:'Record acceptance',invoice:'Prepare invoice',paid:'Record payment'};
  async function perform(action:Action) {
    if(busy) return;
    setWorking(true);
    setActionError('');
    try {
      if(await onAction(action)) {
        setConfirmClose(false);
        if(action==='accept'||action==='invoice'||action==='paid') setTab('invoice');
      }
    } catch {setActionError('This change could not be saved. Please try again.');}
    finally {setWorking(false);}
  }
  const stageNotes={
    Draft:'Send the quote to the customer yourself, then mark it sent to keep the record up to date. DoneKite does not deliver email.',
    Quoted:'Record acceptance only after the customer has agreed to the quote.',
    Accepted:'The quote is accepted. Prepare the invoice using the saved price.',
    Invoiced:'Record a payment you have already received. This action does not charge the customer or process a payment.',
    Paid:'Payment is recorded. The quote, invoice, and activity remain available here.',
    Closed:'This enquiry is closed. Its documents and activity remain available for your records.',
  };
  return <>
    <div className="record-summary"><span>{lead.service} · {lead.email}</span><span className={`badge badge-${lead.status.toLowerCase()}`}>{lead.status}</span></div>
    <div className="record-tabs" role="group" aria-label="Customer record sections">{(['details','quote','invoice','history'] as const).map(item=><button type="button" key={item} aria-pressed={tab===item} className={tab===item?'active':''} onClick={()=>{setTab(item);setConfirmClose(false);}}>{item==='history'?'History':item[0].toUpperCase()+item.slice(1)}</button>)}</div>
    <div className="record-content">
      {tab==='details'&&<>
        <dl className="record-details-grid"><div><dt>Service</dt><dd>{lead.service}</dd></div><div><dt>Scope</dt><dd>{lead.units} {lead.service==='Office clean'?'estimated hours':'bedrooms'}</dd></div><div><dt>Source</dt><dd>{lead.source}</dd></div><div><dt>Received</dt><dd>{date(lead.createdAt)}</dd></div></dl>
        <section className="record-notes"><h3>Customer notes</h3><p>{lead.notes||'No additional notes.'}</p></section>
        {lead.status==='Quoted'&&lead.followupAt!==undefined&&<section className="record-followup"><h3><Mail size={17} aria-hidden="true"/>Follow-up ready</h3><p>A reminder was prepared {date(lead.followupAt)}. Review it in your email app before sending.</p><a className="btn secondary" href={emailDraft(lead,businessName,'followup')}><Mail size={16} aria-hidden="true"/>Open follow-up email</a></section>}
      </>}
      {(tab==='quote'||(tab==='invoice'&&lead.invoiceAt!==undefined))&&<>
        <RecordDocument lead={lead} businessName={businessName} invoice={tab==='invoice'}/>
        <div className="record-document-actions"><button type="button" className="btn secondary" onClick={()=>window.print()}><Printer size={16} aria-hidden="true"/>Print {tab}</button><a className="btn secondary" href={emailDraft(lead,businessName,tab)}><Mail size={16} aria-hidden="true"/>Open {tab} email</a></div>
        <p className="record-note">Email drafts open in your email app. Opening a draft does not send it or update this record.</p>
      </>}
      {tab==='invoice'&&lead.invoiceAt===undefined&&<div className="empty-state"><Receipt size={28} aria-hidden="true"/><h3>No invoice yet</h3><p>{lead.status==='Accepted'?'Prepare an invoice from the accepted quote using the action below.':lead.status==='Closed'?'This enquiry was closed before an invoice was prepared.':'An invoice can be prepared after the customer accepts the quote.'}</p></div>}
      {tab==='history'&&<section aria-label="Enquiry history">{history.length?<ol className="record-history">{history.map(item=><li key={item.id}><Clock size={16} aria-hidden="true"/><div><strong>{item.title}</strong><p>{item.detail}</p><time dateTime={new Date(item.at).toISOString()}>{date(item.at)} · Toronto time</time></div></li>)}</ol>:<div className="empty-state"><FileText size={28} aria-hidden="true"/><h3>No activity recorded</h3><p>Changes to this enquiry will appear here.</p></div>}</section>}
    </div>
    <div className="record-actions">
      <p className="record-note">{stageNotes[lead.status]}</p>
      {(actionError||error)&&<p className="form-error" role="alert">{actionError||error}</p>}
      {confirmClose?<div className="record-close-confirm" role="group" aria-label="Confirm closing this enquiry"><p>Close this enquiry? Follow-up reminders will stop, and the record will be kept in your history.</p><div><button type="button" className="btn secondary" disabled={busy} onClick={()=>setConfirmClose(false)}>Keep open</button><button type="button" className="btn primary" disabled={busy} onClick={()=>void perform('close')}>{busy?'Saving…':'Confirm close'}</button></div></div>:<div className="record-action-buttons">{nextAction&&<button type="button" className="btn primary" disabled={busy} onClick={()=>void perform(nextAction)}>{busy?'Saving…':actionLabels[nextAction]}<ArrowRight size={16} aria-hidden="true"/></button>}{!['Paid','Closed'].includes(lead.status)&&<button type="button" className="btn text-button" disabled={busy} onClick={()=>setConfirmClose(true)}>Close enquiry</button>}</div>}
    </div>
  </>;
}

export function CustomerRecord(props:CustomerRecordProps) {
  return <AppDialog open={!!props.lead} onClose={props.onClose} title={props.lead?.name??'Customer enquiry'}>{props.lead&&<RecordDetails key={props.lead.id} lead={props.lead} businessName={props.businessName} activity={props.activity} saving={props.saving} error={props.error} onAction={props.onAction}/>}</AppDialog>;
}

export default CustomerRecord;
