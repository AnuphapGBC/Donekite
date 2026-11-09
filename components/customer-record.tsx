'use client';

import {useState} from 'react';
import {ArrowRight,CheckCircle2,Clock,FileText,Mail,Pencil,Printer,Receipt} from 'lucide-react';
import {AppDialog} from '@/components/app-dialog';
import {EnquiryEditor} from '@/components/enquiry-editor';
import {FollowupStatus} from '@/components/followup-status';
import {money,subtotal,total,type Activity,type Lead,type LeadEditInput} from '@/lib/automation';
import type {Followup} from '@/lib/enquiry-list';
import {formatQuantity,getIndustry,getLeadUnit} from '@/lib/industries';

type Action='quote'|'accept'|'invoice'|'paid'|'close';
type CustomerRecordProps={
  lead:Lead|null;
  businessName:string;
  activity:Activity[];
  saving:boolean;
  error?:string;
  followup?:Followup;
  onCheckFollowup?:()=>Promise<void>;
  onEdit?:(input:LeadEditInput,expected:LeadEditInput)=>Promise<boolean>;
  onClose:()=>void;
  onAction:(action:Action)=>Promise<boolean>;
};

function date(timestamp:number) {
  return new Intl.DateTimeFormat('en-CA',{dateStyle:'medium',timeStyle:'short',timeZone:'America/Toronto'}).format(timestamp);
}
function emailDraft(lead:Lead,businessName:string,kind:'quote'|'followup'|'invoice') {
  const scope=formatQuantity(lead);
  const unit=getLeadUnit(lead).unit;
  const fields=getIndustry(lead.industry).fields;
  const details=Object.entries(lead.details??{}).filter(([,value])=>value.trim()).map(([key,value])=>`${fields.find(field=>field.id===key)?.label??key}: ${value}`).join('\n');
  const subject=kind==='followup'?`Following up on your ${lead.service.toLowerCase()} quote`: `${kind==='invoice'?'Invoice':'Quote'} for ${lead.service.toLowerCase()}`;
  const body=kind==='followup'
    ? `Hi ${lead.name},\n\nJust following up on your ${lead.service.toLowerCase()} quote for ${money(total(lead))} CAD, including tax. Please let us know if you have any questions or would like to arrange the next step.\n\n${businessName}`
    : `Hi ${lead.name},\n\nHere is your ${kind} from ${businessName}.\n\n${lead.service} — ${scope}\n${details?`${details}\n`:''}Rate: ${money(lead.rate)} CAD per ${unit}\nSubtotal: ${money(subtotal(lead))} CAD\nTax: ${money(lead.tax)} CAD\nTotal: ${money(total(lead))} CAD\n\n${kind==='quote'?'Please reply if you would like to accept this quote or discuss the details.':'Please contact us to confirm payment arrangements.'}\n\n${businessName}`;
  return `mailto:${encodeURIComponent(lead.email)}?subject=${encodeURIComponent(`${businessName} — ${subject}`)}&body=${encodeURIComponent(body)}`;
}

function IndustryDetails({lead}:{lead:Lead}) {
  const fields=getIndustry(lead.industry).fields;
  const details=Object.entries(lead.details??{}).filter(([,value])=>value.trim());
  if(!details.length) return null;
  return <dl className="record-job-details">{details.map(([key,value])=><div key={key}><dt>{fields.find(field=>field.id===key)?.label??key}</dt><dd>{value}</dd></div>)}</dl>;
}

function RecordDocument({lead,businessName,invoice}:{lead:Lead;businessName:string;invoice:boolean}) {
  const effectiveTax=lead.amount>0?new Intl.NumberFormat('en-CA',{maximumFractionDigits:2}).format(lead.tax/lead.amount*100):'0';
  return <article className="record-document printable-document" aria-label={invoice?'Invoice document':'Quote document'}>
    <header><div><p className="eyebrow">{invoice?'INVOICE':'SERVICE QUOTE'}</p><h3>{businessName}</h3></div><span className={`badge badge-${lead.status.toLowerCase()}`}>{invoice?(lead.paidAt!==undefined?'Paid':lead.status==='Closed'?'Closed':'Payment not recorded'):lead.status==='Draft'?'Draft':'Quote record'}</span></header>
    <div className="record-document-parties"><div><small>PREPARED FOR</small><strong>{lead.name}</strong><p>{lead.email}</p></div><div><small>{invoice?'INVOICE PREPARED':'ENQUIRY RECEIVED'}</small><p>{date(invoice?lead.invoiceAt!:lead.createdAt)}</p>{!invoice&&lead.quotedAt!==undefined&&<p>Marked sent {date(lead.quotedAt)}</p>}</div></div>
    <IndustryDetails lead={lead}/>
    <div className="table-scroll"><table className="record-document-table"><caption className="sr-only">{invoice?'Invoice':'Quote'} pricing in Canadian dollars</caption><thead><tr><th>Service</th><th>Quantity</th><th>Rate</th><th>Amount</th></tr></thead><tbody><tr><td>{lead.service}<small>{getIndustry(lead.industry).label}</small></td><td>{formatQuantity(lead)}</td><td>{money(lead.rate)}<small>per {getLeadUnit(lead).unit}</small></td><td>{money(subtotal(lead))}</td></tr></tbody></table></div>
    <dl className="record-totals"><div><dt>Subtotal</dt><dd>{money(subtotal(lead))}</dd></div><div><dt>Tax ({effectiveTax}% effective)</dt><dd>{money(lead.tax)}</dd></div><div className="record-total"><dt>Total <small>CAD</small></dt><dd>{money(total(lead))}</dd></div></dl>
    <p className="record-note">Pricing is saved with this enquiry. Changes to service rates do not change this document.</p>
    {invoice&&lead.paidAt!==undefined&&<p className="record-payment"><CheckCircle2 size={17} aria-hidden="true"/>Payment recorded {date(lead.paidAt)}.</p>}
    {invoice&&lead.status==='Closed'&&lead.paidAt===undefined&&<p className="record-note">This enquiry is closed. No payment has been recorded.</p>}
  </article>;
}

function RecordDetails({lead,businessName,activity,saving,error,onAction,onEdit,followup,onCheckFollowup}:Omit<CustomerRecordProps,'lead'|'onClose'>&{lead:Lead}) {
  const [tab,setTab]=useState<'details'|'quote'|'invoice'|'history'>('details');
  const [editing,setEditing]=useState(false);
  const [confirmClose,setConfirmClose]=useState(false);
  const [working,setWorking]=useState(false);
  const [actionError,setActionError]=useState('');
  const busy=saving||working;
  const followupInfo:Followup=followup??{status:lead.status==='Quoted'&&lead.followupAt!==undefined?'ready':'none'};
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
  if(editing&&onEdit) return <EnquiryEditor key={lead.id} lead={lead} saving={saving} error={error} onCancel={()=>setEditing(false)} onSave={async(input,expected)=>{
    const ok=await onEdit(input,expected);
    if(ok) setEditing(false);
    return ok;
  }}/>;
  return <>
    <div className="record-summary"><span>{lead.service} · {lead.email}</span><span className={`badge badge-${lead.status.toLowerCase()}`}>{lead.status}</span></div>
    <div className="record-tabs" role="group" aria-label="Customer record sections">{(['details','quote','invoice','history'] as const).map(item=><button type="button" key={item} aria-pressed={tab===item} className={tab===item?'active':''} onClick={()=>{setTab(item);setConfirmClose(false);}}>{item==='history'?'History':item[0].toUpperCase()+item.slice(1)}</button>)}</div>
    <div className="record-content">
      {tab==='details'&&<>
        <div className="record-edit-row"><h3>Customer & job details</h3>{onEdit&&<button className="btn secondary" type="button" disabled={busy} onClick={()=>setEditing(true)}><Pencil size={15} aria-hidden="true"/>Edit details</button>}</div>
        <dl className="record-details-grid"><div><dt>Service</dt><dd>{lead.service}</dd></div><div><dt>Scope</dt><dd>{formatQuantity(lead)}</dd></div><div><dt>Source</dt><dd>{lead.source}</dd></div><div><dt>Received</dt><dd>{date(lead.createdAt)}</dd></div></dl>
        <IndustryDetails lead={lead}/>
        <section className="record-notes"><h3>Customer notes</h3><p>{lead.notes||'No additional notes.'}</p></section>
        {followupInfo.status!=='none'&&<section className="record-followup">
          <h3><Mail size={17} aria-hidden="true"/>Follow-up tracking</h3>
          <FollowupStatus followup={followupInfo}/>
          {followupInfo.status==='ready'&&<><p>A reminder was prepared {date(lead.followupAt!)}. Review it in your email app before sending.</p><a className="btn secondary" href={emailDraft(lead,businessName,'followup')}><Mail size={16} aria-hidden="true"/>Open follow-up email</a></>}
          {followupInfo.status==='scheduled'&&<p>A draft will be prepared when the workspace loads or refreshes after this time.</p>}
          {followupInfo.status==='due'&&<><p>This follow-up is due. Refresh the workspace to prepare its draft.</p>{onCheckFollowup&&<button className="btn secondary" type="button" disabled={busy} onClick={()=>void onCheckFollowup()}>Check follow-up</button>}</>}
          {followupInfo.status==='paused'&&<p>Resume “Prepare a follow-up” in Rules & pricing to prepare reminders for unanswered quotes.</p>}
        </section>}
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
  return <AppDialog open={!!props.lead} onClose={props.onClose} title={props.lead?.name??'Customer enquiry'}>{props.lead&&<RecordDetails key={props.lead.id} lead={props.lead} businessName={props.businessName} activity={props.activity} saving={props.saving} error={props.error} onAction={props.onAction} onEdit={props.onEdit} followup={props.followup} onCheckFollowup={props.onCheckFollowup}/>}</AppDialog>;
}

export default CustomerRecord;
