import {total,type Lead,type Settings,type State,type Status} from './automation.ts';
import {getIndustry} from './industries.ts';

export type FollowupStatus = 'scheduled'|'due'|'ready'|'paused'|'none';
export type Followup = {status:FollowupStatus;dueAt?:number};
export type FollowupFilter = 'all'|'attention'|'scheduled'|'paused';
export type EnquirySort = 'newest'|'oldest'|'customer'|'amount-high'|'amount-low';
export type EnquiryFilters = {query?:string;status?:Status|'All';followup?:FollowupFilter;sort?:EnquirySort};

export function getFollowup(lead:Lead,settings:Settings,now:number,enabled=true):Followup {
  if(lead.status!=='Quoted'||lead.quotedAt===undefined) return {status:'none'};
  const dueAt=lead.quotedAt+settings.followupHours*3600000;
  if(!Number.isFinite(dueAt)||Math.abs(dueAt)>8.64e15) return {status:'none'};
  if(lead.followupAt!==undefined) return {status:'ready',dueAt};
  if(!enabled) return {status:'paused',dueAt};
  return {status:now>=dueAt?'due':'scheduled',dueAt};
}

export function selectEnquiries(state:State,filters:EnquiryFilters={}):Lead[] {
  const query=filters.query?.trim().toLocaleLowerCase('en-CA')??'';
  const result=state.leads.filter(lead=>{
    if(filters.status&&filters.status!=='All'&&lead.status!==filters.status) return false;
    if(query&&!`${lead.name} ${lead.email} ${lead.service} ${lead.source} ${lead.notes} ${getIndustry(lead.industry).label} ${Object.values(lead.details??{}).join(' ')}`.toLocaleLowerCase('en-CA').includes(query)) return false;
    if(filters.followup&&filters.followup!=='all') {
      const followup=getFollowup(lead,state.settings,state.now,state.rules.followup).status;
      if(filters.followup==='attention'?!['due','ready'].includes(followup):followup!==filters.followup) return false;
    }
    return true;
  });
  const names=new Intl.Collator('en-CA',{sensitivity:'base',numeric:true});
  return result.sort((left,right)=>{
    let comparison=0;
    switch(filters.sort) {
      case 'oldest':comparison=left.createdAt-right.createdAt;break;
      case 'customer':comparison=names.compare(left.name,right.name);break;
      case 'amount-high':comparison=total(right)-total(left);break;
      case 'amount-low':comparison=total(left)-total(right);break;
      default:comparison=right.createdAt-left.createdAt;
    }
    return comparison||right.createdAt-left.createdAt||left.id.localeCompare(right.id,'en-CA');
  });
}
