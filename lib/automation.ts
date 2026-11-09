export type Status = 'Draft' | 'Quoted' | 'Accepted' | 'Invoiced' | 'Paid' | 'Closed';
export type Service = 'Regular clean' | 'Deep clean' | 'Move-out clean' | 'Office clean';
export type EventKind = 'capture' | 'quote' | 'followup' | 'invoice' | 'payment' | 'system';
export type Lead = {
  id: string; name: string; email: string; service: Service; units: number; notes: string;
  source: string; status: Status; createdAt: number; quotedAt?: number; followupAt?: number;
  paidAt?: number; invoiceAt?: number; amount: number; rate: number; tax: number; autoDrafted: boolean;
};
export type Activity = {id: string; at: number; title: string; detail: string; kind: EventKind; leadId?: string};
export type Rules = {draftQuote: boolean; followup: boolean; invoice: boolean};
export type Settings = {rates: Record<Service,number>; taxPercent: number; followupHours: number};
export type State = {version: 1; now: number; leads: Lead[]; activity: Activity[]; rules: Rules; settings: Settings};
export const services: Service[] = ['Regular clean', 'Deep clean', 'Move-out clean', 'Office clean'];
const statuses: Status[] = ['Draft', 'Quoted', 'Accepted', 'Invoiced', 'Paid', 'Closed'];
const eventKinds: EventKind[] = ['capture', 'quote', 'followup', 'invoice', 'payment', 'system'];
export const defaultSettings: Settings = {rates: {'Regular clean':65,'Deep clean':95,'Move-out clean':110,'Office clean':55},taxPercent:13,followupHours:48};
export const money = (n:number) => new Intl.NumberFormat('en-CA',{style:'currency',currency:'CAD',maximumFractionDigits:2}).format(n);
export function subtotal(lead: Lead) { return Math.round(lead.amount * 100) / 100; }
export function total(lead: Lead) { return Math.round((lead.amount+lead.tax)*100)/100; }
function id() { return typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`; }
function event(state:State,title:string,detail:string,kind:EventKind,leadId?:string) {
  state.activity.unshift({id:id(),at:state.now,title,detail,kind,leadId});
}
function clone(state:State):State { return structuredClone(state); }
export type LeadInput = Pick<Lead,'name'|'email'|'service'|'units'|'notes'|'source'>;
export function addLead(state:State,input:LeadInput):{state:State;id?:string;error?:string} {
  if(!input || typeof input.name!=='string' || typeof input.email!=='string') return {state,error:'Please enter a name and valid email address.'};
  const name=input.name.trim(); const email=input.email.trim().toLowerCase();
  if(!name || name.length>100 || email.length>150 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return {state,error:'Please enter a name and valid email address.'};
  if(!services.includes(input.service) || !Number.isInteger(input.units) || input.units<1 || input.units>20) return {state,error:'Choose a service and between 1 and 20 units.'};
  if(typeof input.notes!=='string' || input.notes.length>2000 || typeof input.source!=='string' || !input.source.trim() || input.source.length>100) return {state,error:'Choose an enquiry source and keep notes within 2,000 characters.'};
  if(!validSettings(state.settings)) return {state,error:'Check your service rates, tax, and follow-up settings before adding an enquiry.'};
  if(state.leads.some(l=>l.email.trim().toLowerCase()===email&&l.service===input.service&&!['Paid','Closed'].includes(l.status))) return {state,error:'This email already has an open enquiry for that service. Open the existing record to continue.'};
  const next=clone(state); const rate=next.settings.rates[input.service]; const amount=Math.round(rate*input.units*100)/100;
  const lead:Lead={...input,name,email,id:id(),status:'Draft',createdAt:next.now,rate,amount,tax:Math.round(amount*next.settings.taxPercent)/100,autoDrafted:next.rules.draftQuote};
  next.leads.unshift(lead);
  event(next,'Enquiry captured',`${name} · ${input.service} · ${input.source}`,'capture',lead.id);
  if(next.rules.draftQuote) event(next,'Quote prepared automatically',`${name} · ${money(total(lead))} including tax · ready for your review`,'quote',lead.id);
  return {state:next,id:lead.id};
}
export function transition(state:State,leadId:string,action:'quote'|'accept'|'invoice'|'paid'|'close'):State {
  const next=clone(state); const lead=next.leads.find(l=>l.id===leadId); if(!lead) return state;
  if(action==='quote'&&lead.status==='Draft') {
    lead.status='Quoted'; lead.quotedAt=next.now;
    event(next,'Quote sent · simulated',`${lead.name} · ${money(total(lead))} · no email delivered`,'quote',lead.id);
  } else if(action==='accept'&&lead.status==='Quoted') {
    lead.status=next.rules.invoice?'Invoiced':'Accepted';
    event(next,'Customer acceptance recorded',`${lead.name} · recorded manually for this demo`,'invoice',lead.id);
    if(next.rules.invoice){lead.invoiceAt=next.now;event(next,'Invoice prepared automatically',`${lead.name} · ${money(total(lead))} · demo only, no payment request sent`,'invoice',lead.id);}
  } else if(action==='invoice'&&lead.status==='Accepted') {
    lead.status='Invoiced';lead.invoiceAt=next.now;
    event(next,'Invoice prepared manually',`${lead.name} · ${money(total(lead))} · demo only`,'invoice',lead.id);
  } else if(action==='paid'&&lead.status==='Invoiced') {
    lead.status='Paid';lead.paidAt=next.now;
    event(next,'Payment recorded · simulated',`${lead.name} · ${money(total(lead))} · no money collected`,'payment',lead.id);
  } else if(action==='close'&&!['Paid','Closed'].includes(lead.status)) {
    lead.status='Closed';event(next,'Enquiry closed',`${lead.name} · no further follow-up`,'system',lead.id);
  } else return state;
  return next;
}
export function advanceTime(state:State,hours:number):State {
  if(!Number.isFinite(hours)||hours<=0||hours>720) return state;
  const next=clone(state);next.now+=hours*3600000;
  event(next,'Demo clock advanced',`${hours} hours later · scheduled work checked`,'system');
  return runFollowups(next);
}
export function runFollowups(state:State):State {
  const next=clone(state); if(!next.rules.followup) return state;
  for(const lead of next.leads) {
    if(lead.status==='Quoted'&&lead.quotedAt!==undefined&&lead.followupAt===undefined&&next.now-lead.quotedAt>=next.settings.followupHours*3600000) {
      lead.followupAt=next.now;
      event(next,'Follow-up prepared automatically',`${lead.name} · one reminder draft · no email delivered`,'followup',lead.id);
    }
  }return next;
}
export function setRule(state:State,key:keyof Rules,value:boolean):State {
  const next=clone(state);next.rules[key]=value;
  const names={draftQuote:'Quote preparation',followup:'Quote follow-up',invoice:'Invoice preparation'};
  event(next,`${names[key]} ${value?'enabled':'paused'}`,'Applies to future actions in this browser','system');return next;
}
export function makeSeed(now:number=Date.now()):State {
  let state:State={version:1,now,leads:[],activity:[],rules:{draftQuote:true,followup:true,invoice:true},settings:structuredClone(defaultSettings)};
  const samples:LeadInput[]=[
    {name:'Olivia Chen',email:'olivia@example.com',service:'Deep clean',units:3,source:'Website form',notes:'Three-bedroom townhouse in Nepean. Prefers a Friday morning.'},
    {name:'James Wilson',email:'james@example.com',service:'Office clean',units:4,source:'Email',notes:'Small office. Four estimated cleaning hours, after 5 pm.'},
    {name:'Sofia Patel',email:'sofia@example.com',service:'Regular clean',units:2,source:'Referral',notes:'Two-bedroom condo. Biweekly service requested.'},
    {name:'Noah Martin',email:'noah@example.com',service:'Move-out clean',units:2,source:'Website form',notes:'Two-bedroom apartment. Keys returned at the end of the month.'}
  ];
  for(const [i,sample] of samples.entries()) {
    state.now=now-(4-i)*24*3600000;const result=addLead(state,sample);state=result.state;
    if(i<3)state=transition(state,result.id!,'quote');
    if(i===2){state=transition(state,result.id!,'accept');state=transition(state,result.id!,'paid');}
  }
  state.now=now;return runFollowups(state);
}
export function estimate(enquiries:number,minutesBefore:number,minutesAfter:number,hourlyValue:number) {
  if(![enquiries,minutesBefore,minutesAfter,hourlyValue].every(n=>Number.isFinite(n)&&n>=0)) return {hours:0,monthlyValue:0};
  const hours=Math.max(0,enquiries*(minutesBefore-minutesAfter)/60);
  const monthlyValue=hours*hourlyValue;
  return Number.isFinite(hours)&&Number.isFinite(monthlyValue)?{hours,monthlyValue}:{hours:0,monthlyValue:0};
}
export function exportCsv(leads:Lead[]) {
  const cell=(s:string|number)=>{let value=String(s);if(/^[\s\u0000-\u001f]*[=+\-@]|^[\t\r\n]/.test(value))value="'"+value;return '"'+value.replaceAll('"','""')+'"';};
  return '\uFEFF'+[['Name','Email','Service','Units','Status','Subtotal CAD','Tax CAD','Total CAD','Source'],...leads.map(l=>[l.name,l.email,l.service,l.units,l.status,l.amount.toFixed(2),l.tax.toFixed(2),total(l).toFixed(2),l.source])].map(r=>r.map(cell).join(',')).join('\r\n');
}
function isRecord(value:unknown):value is Record<string,unknown> {
  return typeof value==='object'&&value!==null&&!Array.isArray(value);
}
function isTimestamp(value:unknown):value is number {
  return typeof value==='number'&&Number.isFinite(value)&&Math.abs(value)<=8.64e15;
}
function isNonnegative(value:unknown):value is number {
  return typeof value==='number'&&Number.isFinite(value)&&value>=0;
}
function validSettings(value:unknown):value is Settings {
  if(!isRecord(value)||!isRecord(value.rates)) return false;
  const rates=value.rates;
  return services.every(service=>isNonnegative(rates[service])&&rates[service]>0&&rates[service]<=10000)
    &&isNonnegative(value.taxPercent)&&value.taxPercent<=100
    &&isNonnegative(value.followupHours)&&value.followupHours>0&&Number.isFinite(value.followupHours*3600000);
}
function validLead(value:unknown):value is Lead {
  if(!isRecord(value)) return false;
  return typeof value.id==='string'&&value.id.length>0
    &&typeof value.name==='string'&&value.name.trim().length>0&&value.name.length<=100
    &&typeof value.email==='string'&&value.email.length<=150&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.email)
    &&services.includes(value.service as Service)&&statuses.includes(value.status as Status)
    &&typeof value.notes==='string'&&value.notes.length<=2000
    &&typeof value.source==='string'&&value.source.trim().length>0&&value.source.length<=100
    &&typeof value.autoDrafted==='boolean'
    &&isNonnegative(value.units)&&Number.isInteger(value.units)&&value.units>=1&&value.units<=20
    &&isNonnegative(value.amount)&&isNonnegative(value.tax)&&isNonnegative(value.rate)&&value.rate>0
    &&Number.isFinite(value.amount+value.tax)&&Number.isFinite((value.amount+value.tax)*100)
    &&isTimestamp(value.createdAt)
    &&['quotedAt','followupAt','paidAt','invoiceAt'].every(key=>value[key]===undefined||isTimestamp(value[key]))
    &&(!['Quoted','Accepted','Invoiced','Paid'].includes(value.status as string)||isTimestamp(value.quotedAt))
    &&(!['Invoiced','Paid'].includes(value.status as string)||isTimestamp(value.invoiceAt))
    &&(value.status!=='Paid'||isTimestamp(value.paidAt));
}
function validActivity(value:unknown):value is Activity {
  return isRecord(value)&&typeof value.id==='string'&&value.id.length>0
    &&typeof value.title==='string'&&typeof value.detail==='string'&&isTimestamp(value.at)
    &&eventKinds.includes(value.kind as EventKind)
    &&(value.leadId===undefined||typeof value.leadId==='string');
}
export function parseSaved(raw:string):State|null {
  try {
    const value:unknown=JSON.parse(raw);
    if(!isRecord(value)||value.version!==1||!isTimestamp(value.now)||!Array.isArray(value.leads)||!Array.isArray(value.activity)||!isRecord(value.rules)||!validSettings(value.settings)) return null;
    const rules=value.rules;
    if(typeof rules.draftQuote!=='boolean'||typeof rules.followup!=='boolean'||typeof rules.invoice!=='boolean') return null;
    if(!value.leads.every(validLead)||!value.activity.every(validActivity)) return null;
    // IDs drive record selection and React keys, so ambiguous snapshots cannot be restored.
    if(new Set(value.leads.map(lead=>lead.id)).size!==value.leads.length||new Set(value.activity.map(activity=>activity.id)).size!==value.activity.length) return null;
    const leadIds=new Set(value.leads.map(lead=>lead.id));
    if(value.activity.some(activity=>activity.leadId!==undefined&&!leadIds.has(activity.leadId))) return null;
    return {
      version:1,now:value.now,leads:value.leads,activity:value.activity,
      rules:{draftQuote:rules.draftQuote,followup:rules.followup,invoice:rules.invoice},
      settings:value.settings,
    };
  }catch{return null;}
}
