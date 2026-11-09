import {getCatalog, getIndustry, getLeadUnit, getServiceRate, industries} from './industries.ts';
import type {IndustryId, ServiceDefinition} from './industries.ts';

export type Status = 'Draft' | 'Quoted' | 'Accepted' | 'Invoiced' | 'Paid' | 'Closed';
export type Service = string;
export type EventKind = 'capture' | 'quote' | 'followup' | 'invoice' | 'payment' | 'system';
export type Lead = {
  id: string; name: string; email: string; service: Service; units: number; notes: string;
  source: string; status: Status; createdAt: number; quotedAt?: number; followupAt?: number;
  paidAt?: number; invoiceAt?: number; amount: number; rate: number; tax: number; autoDrafted: boolean;
  industry?: IndustryId; serviceId?: string; unit?: string; unitPlural?: string;
  maxUnits?: number; quantityStep?: number; details?: Record<string,string>;
};
export type Activity = {id: string; at: number; title: string; detail: string; kind: EventKind; leadId?: string};
export type Rules = {draftQuote: boolean; followup: boolean; invoice: boolean};
export type Settings = {industry?: IndustryId; catalog?: ServiceDefinition[]; rates: Record<string,number>; taxPercent: number; followupHours: number};
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
export type LeadInput = Pick<Lead,'name'|'email'|'service'|'units'|'notes'|'source'|'serviceId'|'details'>;
export function addLead(state:State,input:LeadInput):{state:State;id?:string;error?:string} {
  if(!input || typeof input.name!=='string' || typeof input.email!=='string') return {state,error:'Please enter a name and valid email address.'};
  const name=input.name.trim(); const email=input.email.trim().toLowerCase();
  if(!name || name.length>100 || email.length>150 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return {state,error:'Please enter a name and valid email address.'};
  if(typeof input.notes!=='string' || input.notes.length>2000 || typeof input.source!=='string' || !input.source.trim() || input.source.length>100) return {state,error:'Choose an enquiry source and keep notes within 2,000 characters.'};
  if(!validSettings(state.settings)) return {state,error:'Check your service rates, tax, and follow-up settings before adding an enquiry.'};
  const catalog=getCatalog(state.settings);
  const service=input.serviceId===undefined?catalog.find(item=>item.name===input.service):catalog.find(item=>item.id===input.serviceId);
  if(!service || !validQuantity(input.units,service.maxUnits,service.step)) return {state,error:service?`Enter a quantity from ${service.step} to ${service.maxUnits}, in steps of ${service.step}.`:'Choose a service from your current service list.'};
  const industry=getIndustry(state.settings.industry);
  const details=validateDetails(input.details,industry.id);
  if(typeof details==='string') return {state,error:details};
  if(state.leads.some(l=>l.email.trim().toLowerCase()===email&&(l.serviceId?l.serviceId===service.id:l.service===service.name)&&!['Paid','Closed'].includes(l.status))) return {state,error:'This email already has an open enquiry for that service. Open the existing record to continue.'};
  const next=clone(state); const rate=getServiceRate(next.settings,service); const amount=Math.round(rate*input.units*100)/100;
  const lead:Lead={name,email,service:service.name,serviceId:service.id,industry:industry.id,units:input.units,unit:service.unit,unitPlural:service.unitPlural,maxUnits:service.maxUnits,quantityStep:service.step,details,notes:input.notes,source:input.source.trim(),id:id(),status:'Draft',createdAt:next.now,rate,amount,tax:Math.round(amount*next.settings.taxPercent)/100,autoDrafted:next.rules.draftQuote};
  next.leads.unshift(lead);
  event(next,'Enquiry captured',`${name} · ${service.name} · ${lead.source}`,'capture',lead.id);
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
  return '\uFEFF'+[['Name','Email','Service','Units','Status','Subtotal CAD','Tax CAD','Total CAD','Source','Industry','Unit','Details'],...leads.map(l=>[l.name,l.email,l.service,l.units,l.status,l.amount.toFixed(2),l.tax.toFixed(2),total(l).toFixed(2),l.source,getIndustry(l.industry).label,l.units===1?getLeadUnit(l).unit:getLeadUnit(l).unitPlural,JSON.stringify(l.details??{})])].map(r=>r.map(cell).join(',')).join('\r\n');
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
function validText(value:unknown,max:number):value is string {
  return typeof value==='string'&&value.trim().length>0&&value.length<=max;
}
function validIdentifier(value:unknown):value is string {
  return typeof value==='string'&&/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,99}$/.test(value)&&!['__proto__','constructor','prototype'].includes(value);
}
function validIndustry(value:unknown):value is IndustryId {
  return industries.some(industry=>industry.id===value);
}
function validQuantity(units:unknown,max:number,step:number):units is number {
  if(!isNonnegative(units)||units<step||units>max) return false;
  // Decimal hour increments should not fail because of binary floating-point rounding.
  return Math.abs(units/step-Math.round(units/step))<1e-8;
}
function validQuantityLimits(max:unknown,step:unknown):max is number {
  return isNonnegative(max)&&max>=1&&max<=1000000&&isNonnegative(step)&&step>=0.01&&step<=max;
}
function validService(value:unknown):value is ServiceDefinition {
  return isRecord(value)&&validIdentifier(value.id)&&validText(value.name,100)
    &&validText(value.unit,40)&&validText(value.unitPlural,40)
    &&validQuantityLimits(value.maxUnits,value.step)
    &&isNonnegative(value.defaultRate)&&value.defaultRate>0&&value.defaultRate<=10000;
}
function validDate(value:string):boolean {
  if(!/^\d{4}-\d{2}-\d{2}$/.test(value)||Number(value.slice(0,4))<1) return false;
  const date=new Date(value+'T00:00:00.000Z');
  return Number.isFinite(date.getTime())&&date.toISOString().slice(0,10)===value;
}
function validateDetails(value:unknown,industry:IndustryId):Record<string,string>|string {
  if(value!==undefined&&!isRecord(value)) return 'Check the enquiry details.';
  const raw=value??{};
  const fields=getIndustry(industry).fields;
  if(Object.keys(raw).length>30||Object.keys(raw).some(key=>!fields.some(field=>field.id===key))) return 'Choose the enquiry fields for your current industry.';
  const details:Record<string,string>={};
  for(const field of fields) {
    const entry=raw[field.id];
    if(entry===undefined) {
      if(field.required) return `Enter ${field.label.toLowerCase()}.`;
      continue;
    }
    if(typeof entry!=='string'||entry.length>2000) return `Keep ${field.label.toLowerCase()} within 2,000 characters.`;
    const text=entry.trim();
    if(!text) {
      if(field.required) return `Enter ${field.label.toLowerCase()}.`;
      continue;
    }
    if(field.type==='select'&&!field.options?.includes(text)) return `Choose a valid ${field.label.toLowerCase()}.`;
    if(field.type==='date'&&!validDate(text)) return `Enter a valid ${field.label.toLowerCase()}.`;
    if(field.type==='number'&&(!/^\d+(\.\d+)?$/.test(text)||Number(text)<=0||Number(text)>1000000)) return `Enter a positive ${field.label.toLowerCase()} up to 1,000,000.`;
    details[field.id]=text;
  }
  return details;
}
function validSettings(value:unknown):value is Settings {
  if(!isRecord(value)||!isRecord(value.rates)) return false;
  if(value.industry!==undefined&&!validIndustry(value.industry)) return false;
  if(value.catalog!==undefined&&(!Array.isArray(value.catalog)||value.catalog.length<1||value.catalog.length>30||!value.catalog.every(validService))) return false;
  const catalog=value.catalog as ServiceDefinition[]|undefined;
  if(catalog&&(new Set(catalog.map(service=>service.id)).size!==catalog.length||new Set(catalog.map(service=>service.name.trim().toLowerCase())).size!==catalog.length)) return false;
  const entries=Object.entries(value.rates);
  if(entries.length<1||entries.length>60||entries.some(([key,rate])=>!validText(key,100)||['__proto__','constructor','prototype'].includes(key)||!isNonnegative(rate)||rate<=0||rate>10000)) return false;
  const settings=value as Settings;
  return getCatalog(settings).every(service=>Object.hasOwn(settings.rates,service.id)||Object.hasOwn(settings.rates,service.name))
    &&isNonnegative(value.taxPercent)&&value.taxPercent<=100
    &&isNonnegative(value.followupHours)&&value.followupHours>0&&Number.isFinite(value.followupHours*3600000);
}
function validLead(value:unknown):value is Lead {
  if(!isRecord(value)) return false;
  const hasSnapshot=['industry','serviceId','unit','unitPlural','maxUnits','quantityStep'].some(key=>value[key]!==undefined);
  if(hasSnapshot) {
    if(!validIndustry(value.industry)||!validIdentifier(value.serviceId)||!validText(value.unit,40)||!validText(value.unitPlural,40)) return false;
    if((value.maxUnits===undefined)!==(value.quantityStep===undefined)) return false;
    const preset=getIndustry(value.industry).services.find(service=>service.id===value.serviceId);
    const max=value.maxUnits??preset?.maxUnits??1000000;
    const step=value.quantityStep??preset?.step??0.01;
    if(!validQuantityLimits(max,step)||!validQuantity(value.units,max,step as number)) return false;
    if(typeof validateDetails(value.details,value.industry)==='string') return false;
  } else {
    if(!services.includes(value.service as Service)||!validQuantity(value.units,20,1)) return false;
    if(value.details!==undefined&&typeof validateDetails(value.details,'cleaning')==='string') return false;
  }
  return typeof value.id==='string'&&value.id.length>0
    &&typeof value.name==='string'&&value.name.trim().length>0&&value.name.length<=100
    &&typeof value.email==='string'&&value.email.length<=150&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.email)
    &&validText(value.service,100)&&statuses.includes(value.status as Status)
    &&typeof value.notes==='string'&&value.notes.length<=2000
    &&typeof value.source==='string'&&value.source.trim().length>0&&value.source.length<=100
    &&typeof value.autoDrafted==='boolean'
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
