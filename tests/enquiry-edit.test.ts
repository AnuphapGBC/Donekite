import {test} from 'node:test';
import assert from 'node:assert/strict';
import {addLead,defaultSettings,parseSaved,transition,updateLead,type Lead,type LeadEditInput,type State} from '../lib/automation.ts';
import {createIndustrySettings,getCatalog} from '../lib/industries.ts';

function captured():{state:State;lead:Lead} {
  const settings=createIndustrySettings('events');
  const service=getCatalog(settings).find(item=>item.id==='catering')!;
  const state:State={version:1,now:Date.UTC(2026,10,9),leads:[],activity:[],rules:{draftQuote:true,followup:true,invoice:true},settings};
  const result=addLead(state,{name:'Taylor Morgan',email:'taylor@example.com',service:service.name,serviceId:service.id,units:40,source:'Phone',notes:'Original notes',details:{eventDate:'2027-06-12',location:'Town hall',guestCount:'40'}});
  assert.equal(result.error,undefined);
  return {state:result.state,lead:result.state.leads[0]};
}
function editable(lead:Lead):LeadEditInput {
  return {name:lead.name,email:lead.email,source:lead.source,notes:lead.notes,details:structuredClone(lead.details)};
}

test('editing historical industry answers preserves all pricing, service, workflow, and timestamps',()=>{
  let {state,lead}=captured();
  state=transition(transition(transition(state,lead.id,'quote'),lead.id,'accept'),lead.id,'paid');
  state.settings=createIndustrySettings('professional');
  lead=state.leads[0];
  const original=structuredClone(state);
  const input={...editable(lead),name:'  Taylor Updated  ',email:'  UPDATED@EXAMPLE.COM ',source:' Referral ',notes:'Updated private notes',details:{eventDate:'2027-06-13',location:'  New venue  ',guestCount:'45'}};
  const result=updateLead(state,lead.id,input);
  assert.equal(result.error,undefined);
  assert.deepEqual(state,original);
  assert.deepEqual(result.state.leads[0],{...lead,name:'Taylor Updated',email:'updated@example.com',source:'Referral',notes:input.notes,details:{eventDate:'2027-06-13',location:'New venue',guestCount:'45'}});
  assert.equal(result.state.activity.length,state.activity.length+1);
  assert.equal(result.state.activity[0].title,'Enquiry details updated');
  assert.equal(result.state.activity[0].leadId,lead.id);
  assert.deepEqual(parseSaved(JSON.stringify(result.state)),result.state);
});

test('invalid edits preserve the original state and enforce the saved industry fields',()=>{
  const {state,lead}=captured();
  const input=editable(lead);
  const invalid=[null,{...input,name:' '},{...input,name:'x'.repeat(101)},{...input,email:'bad'},{...input,email:null},{...input,source:''},{...input,source:'x'.repeat(101)},{...input,notes:null},{...input,notes:'x'.repeat(2001)},{...input,details:{}},{...input,details:{...lead.details,eventDate:'2027-02-30'}},{...input,details:{...lead.details,brief:'Wrong industry'}}];
  for(const value of invalid) {
    const result=updateLead(state,lead.id,value as LeadEditInput);
    assert.ok(result.error,JSON.stringify(value));
    assert.equal(result.state,state);
  }
  const missing=updateLead(state,'missing',input);
  assert.match(missing.error!,/could not be found/);
  assert.equal(missing.state,state);
});

test('no-op edits ignore JSONB key ordering and do not create activity',()=>{
  const {state,lead}=captured();
  const input={...editable(lead),name:'  Taylor Morgan ',email:' TAYLOR@EXAMPLE.COM ',source:' Phone ',details:{guestCount:'40',location:'Town hall',eventDate:'2027-06-12'}};
  assert.equal(updateLead(state,lead.id,input).state,state);
  const legacy:State={version:1,now:state.now,leads:[{...lead,industry:undefined,serviceId:undefined,unit:undefined,unitPlural:undefined,maxUnits:undefined,quantityStep:undefined,service:'Deep clean',units:2,details:undefined}],activity:[],rules:state.rules,settings:structuredClone(defaultSettings)};
  assert.equal(updateLead(legacy,lead.id,{...editable(legacy.leads[0]),details:{}}).state,legacy);
  const changed=updateLead(legacy,lead.id,{...editable(legacy.leads[0]),details:{address:'10 Main Street'}});
  assert.equal(changed.error,undefined);
  assert.equal(changed.state.leads[0].details!.address,'10 Main Street');
});

test('open duplicate detection uses stable service IDs, with legacy name fallback',()=>{
  const {state,lead}=captured();
  const other={...structuredClone(lead),id:'other',name:'Other customer',email:'other@example.com',service:'Renamed catering'};
  state.leads.push(other);
  const attempt=()=>updateLead(state,lead.id,{...editable(lead),email:' OTHER@EXAMPLE.COM '});
  assert.match(attempt().error!,/already has an open enquiry/);
  other.serviceId='different-service';
  assert.equal(attempt().error,undefined);
  other.serviceId=undefined;other.service=lead.service;
  assert.match(attempt().error!,/already has an open enquiry/);
  other.status='Closed';
  assert.equal(attempt().error,undefined);
  other.status='Draft';lead.status='Closed';
  assert.equal(attempt().error,undefined);
});

test('expected editable details guard stale drafts while allowing independent workflow changes',()=>{
  const {state,lead}=captured();
  const expected=editable(lead);
  expected.details={guestCount:'40',location:'Town hall',eventDate:'2027-06-12'};
  const progressed=transition(state,lead.id,'quote');
  const result=updateLead(progressed,lead.id,{...editable(lead),notes:'New notes'},expected);
  assert.equal(result.error,undefined);
  assert.equal(result.state.leads[0].status,'Quoted');
  assert.equal(result.state.leads[0].quotedAt,progressed.now);
  const latest=structuredClone(state);
  latest.leads[0].email='teammate-updated@example.com';
  const conflict=updateLead(latest,lead.id,{...editable(lead),notes:'My unsaved draft'},expected);
  assert.match(conflict.error!,/updated by a teammate/);
  assert.equal(conflict.state,latest);
});

test('unexpected financial fields in runtime edit input cannot rewrite saved prices',()=>{
  const {state,lead}=captured();
  const result=updateLead(state,lead.id,{...editable(lead),notes:'Updated notes',amount:1,tax:0,rate:1,units:1,status:'Paid'} as LeadEditInput);
  assert.equal(result.error,undefined);
  const changed=result.state.leads[0];
  assert.equal(changed.amount,lead.amount);
  assert.equal(changed.tax,lead.tax);
  assert.equal(changed.rate,lead.rate);
  assert.equal(changed.units,lead.units);
  assert.equal(changed.status,lead.status);
});
