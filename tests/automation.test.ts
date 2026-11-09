import {test} from 'node:test';
import assert from 'node:assert/strict';
import {addLead,advanceTime,defaultSettings,estimate,exportCsv,makeSeed,parseSaved,runFollowups,setRule,total,transition} from '../lib/automation.ts';
import type {LeadInput,State} from '../lib/automation.ts';
const input:LeadInput={name:'Taylor Morgan',email:'taylor@example.com',service:'Deep clean',units:3,notes:'Sample only',source:'Website form'};
function empty():State{return {version:1,now:Date.UTC(2026,10,8,14),leads:[],activity:[],rules:{draftQuote:true,followup:true,invoice:true},settings:structuredClone(defaultSettings)};}
function captured(){const result=addLead(empty(),input);assert.ok(result.id);return {state:result.state,id:result.id!};}
test('quote pricing and tax are captured without changing the original state',()=>{const original=empty();const r=addLead(original,input);assert.equal(original.leads.length,0);assert.equal(r.state.leads[0].amount,285);assert.equal(r.state.leads[0].tax,37.05);assert.equal(total(r.state.leads[0]),322.05);assert.equal(r.state.activity[0].title,'Quote prepared automatically');});
test('duplicate email and service is rejected, closed enquiries allow a new job',()=>{const {state,id}=captured();const r=addLead(state,{...input,email:' TAYLOR@example.com '});assert.ok(r.error);assert.equal(r.state,state);assert.ok(addLead(transition(state,id,'close'),input).id);assert.ok(addLead(state,{...input,service:'Office clean'}).id);});
test('invalid fields are rejected',()=>{for(const value of [{email:'bad'},{name:'  '},{units:0},{units:1.5},{units:21}])assert.ok(addLead(empty(),{...input,...value}).error);});
test('price changes do not rewrite an existing quote',()=>{const {state}=captured();state.settings.rates['Deep clean']=120;const r=addLead(state,{...input,email:'different@example.com'});assert.equal(r.state.leads[0].amount,360);assert.equal(r.state.leads[1].amount,285);});
test('one follow-up is prepared only after the configured delay',()=>{const {state,id}=captured();const quoted=transition(state,id,'quote');assert.equal(advanceTime(quoted,47).leads[0].followupAt,undefined);const due=advanceTime(quoted,48);assert.equal(due.leads[0].followupAt,due.now);const again=advanceTime(due,48);assert.equal(again.activity.filter(a=>a.kind==='followup').length,1);});
test('paused follow-up is skipped and resumes when scheduled work is checked',()=>{const {state,id}=captured();const paused=setRule(transition(state,id,'quote'),'followup',false);const later=advanceTime(paused,72);assert.equal(later.leads[0].followupAt,undefined);const enabled=setRule(later,'followup',true);assert.ok(runFollowups(enabled).leads[0].followupAt);});
test('acceptance, closed records and paid invoices cannot receive follow-ups',()=>{for(const mode of ['accept','close','paid'] as const){const {state,id}=captured();let s=transition(state,id,'quote');s=mode==='paid'?transition(transition(s,id,'accept'),id,'paid'):transition(s,id,mode);assert.equal(advanceTime(s,72).activity.filter(a=>a.kind==='followup').length,0);}});
test('invoice preparation honors paused rule and invalid transitions are ignored',()=>{const {state,id}=captured();const paused=setRule(state,'invoice',false);assert.equal(transition(paused,id,'paid'),paused);const accepted=transition(transition(paused,id,'quote'),id,'accept');assert.equal(accepted.leads[0].status,'Accepted');assert.equal(accepted.leads[0].invoiceAt,undefined);const invoiced=transition(accepted,id,'invoice');assert.equal(invoiced.leads[0].status,'Invoiced');const paid=transition(invoiced,id,'paid');assert.equal(paid.leads[0].status,'Paid');assert.equal(transition(paid,id,'paid'),paid);});
test('automatic quote rule changes future capture and automatic invoicing works',()=>{const r=addLead(setRule(empty(),'draftQuote',false),input);assert.equal(r.state.leads[0].autoDrafted,false);assert.equal(r.state.activity.filter(a=>a.title==='Quote prepared automatically').length,0);const invoice=transition(transition(r.state,r.id!,'quote'),r.id!,'accept');assert.equal(invoice.leads[0].status,'Invoiced');assert.ok(invoice.activity.some(a=>a.title==='Invoice prepared automatically'));});
test('impact estimator clamps negative time savings and has transparent arithmetic',()=>{assert.deepEqual(estimate(40,20,5,30),{hours:10,monthlyValue:300});assert.deepEqual(estimate(40,5,20,30),{hours:0,monthlyValue:0});});
test('CSV escapes quotes and prevents spreadsheet formulas',()=>{const {state}=captured();state.leads[0].name='=HYPERLINK("bad")';const csv=exportCsv(state.leads);assert.ok(csv.includes('"\'=HYPERLINK(""bad"")"'));assert.ok(csv.includes('"322.05"'));});
test('saved records round trip and corrupt data is ignored',()=>{const seed=makeSeed(Date.UTC(2026,10,8));assert.deepEqual(parseSaved(JSON.stringify(seed)),seed);assert.equal(parseSaved('not-json'),null);assert.equal(parseSaved('{"version":1}'),null);const bad=structuredClone(seed);bad.leads[0].amount=NaN;assert.equal(parseSaved(JSON.stringify(bad)),null);});

test('capture rejects malformed runtime input without changing records',()=>{
  const state=empty();
  for(const patch of [{name:null},{email:123},{notes:null},{source:''},{notes:'x'.repeat(2001)},{name:'x'.repeat(101)}]) {
    const result=addLead(state,{...input,...patch} as unknown as LeadInput);
    assert.ok(result.error);
    assert.equal(result.state,state);
  }
  state.settings.taxPercent=-13;
  assert.ok(addLead(state,input).error);
  state.settings.taxPercent=13;
  state.settings.rates['Deep clean']=Infinity;
  assert.ok(addLead(state,input).error);
});

test('restored email casing cannot bypass duplicate checking',()=>{
  const {state}=captured();
  state.leads[0].email='Taylor@Example.com';
  assert.ok(addLead(state,input).error);
});

test('a follow-up prepared at timestamp zero is not repeated',()=>{
  const {state,id}=captured();
  state.now=-48*3600000;
  const quoted=transition(state,id,'quote');
  const due=advanceTime(quoted,48);
  assert.equal(due.leads[0].followupAt,0);
  assert.equal(runFollowups(due).activity.filter(activity=>activity.kind==='followup').length,1);
});

test('estimator rejects invalid and overflowing assumptions',()=>{
  for(const values of [[NaN,20,5,30],[40,20,5,-30],[-40,5,20,30],[40,Infinity,5,30],[Number.MAX_VALUE,Number.MAX_VALUE,0,30]]) {
    assert.deepEqual(estimate(values[0],values[1],values[2],values[3]),{hours:0,monthlyValue:0});
  }
});

test('CSV neutralizes formulas after leading whitespace and control characters',()=>{
  const {state}=captured();
  for(const name of [' =1+1','\n=1+1','\t@SUM(1)','\r+1+1','\u0000-1+1']) {
    state.leads[0].name=name;
    assert.ok(exportCsv(state.leads).includes(`"'${name}"`));
  }
});

test('saved records reject malformed fields used by the application',()=>{
  const seed=makeSeed(Date.UTC(2026,10,8));
  const invalidLeadFields=[
    {id:''},{name:''},{email:'invalid'},{source:{}},{notes:[]},{autoDrafted:'true'},
    {units:1.5},{units:0},{units:21},{rate:-1},{amount:-1},{tax:-1},
    {createdAt:9e15},{quotedAt:'yesterday'},{followupAt:null},{invoiceAt:9e15},{paidAt:false},
  ];
  for(const fields of invalidLeadFields) {
    const state=structuredClone(seed);
    Object.assign(state.leads[0],fields);
    assert.equal(parseSaved(JSON.stringify(state)),null,JSON.stringify(fields));
  }
  for(const fields of [{kind:'unknown'},{leadId:'missing'},{id:''},{at:9e15}]) {
    const state=structuredClone(seed);
    Object.assign(state.activity[0],fields);
    assert.equal(parseSaved(JSON.stringify(state)),null,JSON.stringify(fields));
  }
});

test('saved records reject invalid configuration, ambiguous IDs, and incomplete payment state',()=>{
  const seed=makeSeed(Date.UTC(2026,10,8));
  for(const patch of [{taxPercent:-1},{taxPercent:101},{followupHours:0},{followupHours:-1}]) {
    const state=structuredClone(seed);
    Object.assign(state.settings,patch);
    assert.equal(parseSaved(JSON.stringify(state)),null);
  }
  const duplicateLead=structuredClone(seed);
  duplicateLead.leads.push(structuredClone(duplicateLead.leads[0]));
  assert.equal(parseSaved(JSON.stringify(duplicateLead)),null);
  const duplicateActivity=structuredClone(seed);
  duplicateActivity.activity.push(structuredClone(duplicateActivity.activity[0]));
  assert.equal(parseSaved(JSON.stringify(duplicateActivity)),null);
  const incomplete=structuredClone(seed);
  delete incomplete.leads.find(lead=>lead.status==='Paid')!.paidAt;
  assert.equal(parseSaved(JSON.stringify(incomplete)),null);
  const invalidTime=structuredClone(seed);
  invalidTime.now=9e15;
  assert.equal(parseSaved(JSON.stringify(invalidTime)),null);
});
