import {test} from 'node:test';
import assert from 'node:assert/strict';
import {defaultSettings,type Lead,type State,type Status} from '../lib/automation.ts';
import {getFollowup,selectEnquiries} from '../lib/enquiry-list.ts';

const hour=3600000;
function lead(patch:Partial<Lead>={}):Lead {
  return {id:'lead',name:'Taylor Morgan',email:'taylor@example.com',service:'Deep clean',units:2,notes:'Back door access',source:'Phone',status:'Quoted',createdAt:-hour,quotedAt:0,amount:100,tax:13,rate:50,autoDrafted:true,...patch};
}
function workspace(leads:Lead[]):State {
  return {version:1,now:48*hour,leads,activity:[],rules:{draftQuote:true,followup:true,invoice:true},settings:structuredClone(defaultSettings)};
}

test('follow-up tracking uses the due-time boundary and accepts timestamp zero',()=>{
  const record=lead();
  assert.deepEqual(getFollowup(record,defaultSettings,48*hour-1),{status:'scheduled',dueAt:48*hour});
  assert.deepEqual(getFollowup(record,defaultSettings,48*hour),{status:'due',dueAt:48*hour});
  assert.deepEqual(getFollowup({...record,followupAt:0},defaultSettings,48*hour),{status:'ready',dueAt:48*hour});
  assert.deepEqual(getFollowup(record,{...defaultSettings,followupHours:72},48*hour),{status:'scheduled',dueAt:72*hour});
});

test('prepared follow-ups remain ready when the rule is paused, while other reminders pause',()=>{
  const record=lead();
  assert.equal(getFollowup(record,defaultSettings,72*hour,false).status,'paused');
  assert.equal(getFollowup({...record,followupAt:0},defaultSettings,72*hour,false).status,'ready');
  for(const status of ['Draft','Accepted','Invoiced','Paid','Closed'] as Status[]) {
    assert.deepEqual(getFollowup({...record,status,followupAt:0},defaultSettings,72*hour),{status:'none'});
  }
  assert.deepEqual(getFollowup({...record,quotedAt:undefined},defaultSettings,72*hour),{status:'none'});
});

test('enquiry search covers contact, service, source, notes, and historical industry answers',()=>{
  const records=[lead({id:'cleaning'}),lead({id:'event',name:'Alex Event',email:'alex@example.com',service:'Catering',source:'Referral',notes:'Vegetarian menu',industry:'events',details:{eventDate:'2027-06-12',location:'Town hall',guestCount:'40'}})];
  const state=workspace(records);
  for(const query of ['  ALEX EVENT ','alex@example.com','catering','referral','vegetarian','town HALL','2027-06-12','events']) {
    assert.deepEqual(selectEnquiries(state,{query}).map(item=>item.id),['event'],query);
  }
  assert.deepEqual(selectEnquiries(state,{query:'no match'}),[]);
  assert.equal(selectEnquiries(state,{query:'   '}).length,2);
});

test('status and follow-up filters combine and preserve prepared drafts when paused',()=>{
  const state=workspace([
    lead({id:'due'}),lead({id:'ready',followupAt:0}),lead({id:'scheduled',quotedAt:hour}),lead({id:'paid',status:'Paid'}),
  ]);
  assert.deepEqual(selectEnquiries(state,{followup:'attention'}).map(item=>item.id),['due','ready']);
  assert.deepEqual(selectEnquiries(state,{followup:'scheduled'}).map(item=>item.id),['scheduled']);
  assert.deepEqual(selectEnquiries(state,{status:'Paid'}).map(item=>item.id),['paid']);
  assert.deepEqual(selectEnquiries(state,{status:'Paid',followup:'attention'}),[]);
  state.rules.followup=false;
  assert.deepEqual(selectEnquiries(state,{followup:'attention'}).map(item=>item.id),['ready']);
  assert.deepEqual(selectEnquiries(state,{followup:'paused'}).map(item=>item.id),['due','scheduled']);
});

test('enquiry sorts use total amounts, deterministic ties, and leave state untouched',()=>{
  const state=workspace([
    lead({id:'b',name:'Charlie',createdAt:20,amount:100,tax:0}),
    lead({id:'a',name:'alice',createdAt:20,amount:95,tax:20}),
    lead({id:'c',name:'Bob',createdAt:10,amount:100,tax:0}),
  ]);
  const original=structuredClone(state);
  const sorted=(sort:'newest'|'oldest'|'customer'|'amount-high'|'amount-low')=>selectEnquiries(state,{sort}).map(item=>item.id);
  assert.deepEqual(sorted('newest'),['a','b','c']);
  assert.deepEqual(sorted('oldest'),['c','a','b']);
  assert.deepEqual(sorted('customer'),['a','c','b']);
  assert.deepEqual(sorted('amount-high'),['a','b','c']);
  assert.deepEqual(sorted('amount-low'),['b','c','a']);
  assert.deepEqual(state,original);
});
