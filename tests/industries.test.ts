import {test} from 'node:test';
import assert from 'node:assert/strict';
import {addLead,defaultSettings,exportCsv,makeSeed,parseSaved,total} from '../lib/automation.ts';
import type {LeadInput,State} from '../lib/automation.ts';
import {createIndustrySettings,formatQuantity,getCatalog,getLeadUnit,getServiceRate,industries} from '../lib/industries.ts';
import type {IndustryId} from '../lib/industries.ts';

const detailsByIndustry: Record<IndustryId,Record<string,string>> = {
  cleaning: {propertyType:'Condo',address:'1 Main Street'},
  landscaping: {address:'1 Main Street',area:'250.5'},
  trades: {jobType:'Repair',urgency:'Routine',address:'1 Main Street'},
  automotive: {vehicleMake:'Toyota',vehicleModel:'Corolla'},
  events: {eventDate:'2027-06-12',location:'Town Hall',guestCount:'40'},
  professional: {brief:'Review the business plan',deadline:'2027-06-12'},
  general: {description:'Repair the garden gate'},
};

function empty(industry:IndustryId):State {
  return {version:1,now:Date.UTC(2026,10,9),leads:[],activity:[],rules:{draftQuote:true,followup:true,invoice:true},settings:createIndustrySettings(industry)};
}
function inputFor(state:State):LeadInput {
  const service=getCatalog(state.settings)[0];
  return {name:'Taylor Morgan',email:'taylor@example.com',service:service.name,serviceId:service.id,units:1,notes:'Private notes',source:'Website form',details:detailsByIndustry[state.settings.industry!]};
}

test('every industry captures its own fields, service units, and pricing',()=>{
  assert.equal(industries.length,7);
  for(const industry of industries) {
    const state=empty(industry.id);
    const service=getCatalog(state.settings)[0];
    const result=addLead(state,inputFor(state));
    assert.equal(result.error,undefined,industry.id);
    const lead=result.state.leads[0];
    assert.equal(lead.industry,industry.id);
    assert.equal(lead.serviceId,service.id);
    assert.equal(formatQuantity(lead),`1 ${service.unit}`);
    assert.equal(lead.rate,service.defaultRate);
    assert.equal(lead.amount,service.defaultRate);
    assert.deepEqual(lead.details,detailsByIndustry[industry.id]);
    assert.deepEqual(parseSaved(JSON.stringify(result.state)),result.state);
    assert.equal(state.leads.length,0);
  }
});

test('industry templates preserve business tax and follow-up settings without sharing mutable catalogs',()=>{
  const old=empty('events').settings;
  old.taxPercent=5;
  old.followupHours=72;
  const first=createIndustrySettings('professional',old);
  const second=createIndustrySettings('professional');
  assert.equal(first.taxPercent,5);
  assert.equal(first.followupHours,72);
  assert.equal(getCatalog(first)[0].name,'Consulting');
  getCatalog(first)[0].name='My consulting service';
  assert.equal(getCatalog(second)[0].name,'Consulting');
  assert.equal(industries.find(industry=>industry.id==='professional')!.services[0].name,'Consulting');
});

test('fractional service quantities enforce their increments and round quote amounts to cents',()=>{
  const state=empty('professional');
  const input={...inputFor(state),units:1.25};
  state.settings.rates[input.serviceId!]=99.99;
  const result=addLead(state,input);
  assert.equal(result.error,undefined);
  assert.equal(result.state.leads[0].amount,124.99);
  assert.equal(result.state.leads[0].tax,16.25);
  assert.equal(total(result.state.leads[0]),141.24);
  assert.equal(formatQuantity(result.state.leads[0]),'1.25 hours');
  for(const units of [0,0.1,1.2,1000.25,NaN,Infinity,'1.25']) {
    assert.ok(addLead(state,{...input,units} as LeadInput).error,String(units));
  }
  const decimal=empty('general');
  getCatalog(decimal.settings)[0].step=0.1;
  assert.ok(addLead(decimal,{...inputFor(decimal),units:0.3}).id);
});

test('industry field validation rejects missing, unrelated, malformed, and impossible details',()=>{
  const events=empty('events');
  const input=inputFor(events);
  for(const details of [undefined,{}, {...input.details,eventDate:'2027-02-30'}, {...input.details,eventDate:'06/12/2027'}, {...input.details,location:' '}, {...input.details,guestCount:'0'}, {...input.details,guestCount:'1e3'}, {...input.details,guestCount:'1000001'}, {...input.details,vehicleModel:'Corolla'}, {...input.details,location:42}]) {
    assert.ok(addLead(events,{...input,details} as LeadInput).error,JSON.stringify(details));
  }
  const trades=empty('trades');
  assert.ok(addLead(trades,{...inputFor(trades),details:{...detailsByIndustry.trades,jobType:'Unknown'}}).error);
  const cleaning=empty('cleaning');
  assert.ok(addLead(cleaning,{...inputFor(cleaning),details:undefined}).id);
  const result=addLead(events,{...input,details:{eventDate:'2028-02-29',location:'  Town Hall  ',guestCount:''}});
  assert.deepEqual(result.state.leads[0].details,{eventDate:'2028-02-29',location:'Town Hall'});
});

test('historical service details and agreed amounts survive renaming, removal, and industry changes',()=>{
  let state=empty('professional');
  const input={...inputFor(state),units:1.25};
  state=addLead(state,input).state;
  const original=structuredClone(state.leads[0]);
  getCatalog(state.settings)[0].name='Strategy workshop';
  getCatalog(state.settings)[0].unit='session';
  getCatalog(state.settings)[0].unitPlural='sessions';
  getCatalog(state.settings)[0].step=1;
  getCatalog(state.settings)[0].maxUnits=1;
  state.settings.rates[input.serviceId!]=200;
  assert.ok(addLead(state,{...input,service:'Strategy workshop',units:1}).error,'stable ID still blocks a duplicate after renaming');
  assert.deepEqual(parseSaved(JSON.stringify(state))!.leads[0],original);
  state.settings.catalog=getCatalog(state.settings).slice(1);
  delete state.settings.rates[input.serviceId!];
  assert.deepEqual(parseSaved(JSON.stringify(state))!.leads[0],original);
  state.settings=createIndustrySettings('automotive',state.settings);
  assert.deepEqual(parseSaved(JSON.stringify(state))!.leads[0],original);
  assert.equal(formatQuantity(state.leads[0]),'1.25 hours');
});

test('custom catalogs use stable IDs, charge configured units, and record the resolved service name',()=>{
  const state=empty('general');
  state.settings.catalog=[{id:'custom-project',name:'Repair package',unit:'package',unitPlural:'packages',step:1,maxUnits:8,defaultRate:75}];
  state.settings.rates={'custom-project':125.5};
  const input={...inputFor(state),service:'Untrusted display text',units:2};
  const result=addLead(state,input);
  assert.equal(result.state.leads[0].service,'Repair package');
  assert.equal(formatQuantity(result.state.leads[0]),'2 packages');
  assert.equal(result.state.leads[0].amount,251);
  assert.ok(result.state.activity.find(activity=>activity.kind==='capture')!.detail.includes('Repair package'));
  assert.deepEqual(parseSaved(JSON.stringify(result.state)),result.state);
  assert.ok(addLead(state,{...input,serviceId:'removed-service'}).error);
});

test('legacy cleaning snapshots and name-based prices remain readable after industry changes',()=>{
  const legacy=makeSeed(Date.UTC(2026,10,9));
  for(const lead of legacy.leads) {
    delete lead.industry; delete lead.serviceId; delete lead.unit; delete lead.unitPlural;
    delete lead.maxUnits; delete lead.quantityStep; delete lead.details;
  }
  legacy.settings=structuredClone(defaultSettings);
  assert.deepEqual(parseSaved(JSON.stringify(legacy)),legacy);
  assert.deepEqual(getLeadUnit(legacy.leads.find(lead=>lead.service==='Office clean')!),{unit:'hour',unitPlural:'hours'});
  assert.equal(getServiceRate(legacy.settings,getCatalog(legacy.settings)[1]),95);
  const original=structuredClone(legacy.leads);
  legacy.settings=createIndustrySettings('events');
  assert.deepEqual(parseSaved(JSON.stringify(legacy))!.leads,original);
});

test('saved industry settings and historical snapshots reject malformed metadata',()=>{
  const captured=addLead(empty('events'),inputFor(empty('events'))).state;
  for(const patch of [{industry:'unknown'},{catalog:[]},{catalog:[{...getCatalog(captured.settings)[0],id:'__proto__'}]},{catalog:[{...getCatalog(captured.settings)[0],step:0}]},{catalog:[{...getCatalog(captured.settings)[0],maxUnits:1000001}]}]) {
    const state=structuredClone(captured);
    Object.assign(state.settings,patch);
    assert.equal(parseSaved(JSON.stringify(state)),null,JSON.stringify(patch));
  }
  for(const patch of [{industry:'unknown'},{unit:''},{quantityStep:0},{maxUnits:0},{units:1.2},{details:{eventDate:'2027-02-30',location:'Town Hall'}}]) {
    const state=structuredClone(captured);
    Object.assign(state.leads[0],patch);
    assert.equal(parseSaved(JSON.stringify(state)),null,JSON.stringify(patch));
  }
});

test('CSV exports each historical industry and unit and escapes custom labels and details',()=>{
  const state=empty('events');
  const service=getCatalog(state.settings)[0];
  service.name='=HYPERLINK("bad")';
  service.unitPlural=' +SUM(1)';
  const result=addLead(state,{...inputFor(state),units:2,details:{eventDate:'2027-06-12',location:'Hall, "A"\nSecond floor'}});
  const csv=exportCsv(result.state.leads);
  assert.ok(csv.includes('"Industry","Unit","Details"'));
  assert.ok(csv.includes('"\'=HYPERLINK(""bad"")"'));
  assert.ok(csv.includes('"\' +SUM(1)"'));
  assert.ok(csv.includes('"Events"'));
  assert.ok(csv.includes('Hall, \\""A\\""\\nSecond floor'));
});
