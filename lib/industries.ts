import type {Lead, Settings} from './automation.ts';

export type IndustryId = 'cleaning' | 'landscaping' | 'trades' | 'automotive' | 'events' | 'professional' | 'general';
export type ServiceDefinition = {
  id: string;
  name: string;
  unit: string;
  unitPlural: string;
  maxUnits: number;
  step: number;
  defaultRate: number;
};
export type IndustryField = {
  id: string;
  label: string;
  type: 'text' | 'date' | 'number' | 'select';
  required?: boolean;
  options?: string[];
  placeholder?: string;
};
export type Industry = {
  id: IndustryId;
  label: string;
  description: string;
  services: ServiceDefinition[];
  fields: IndustryField[];
};

function service(id: string, name: string, unit: string, unitPlural: string, defaultRate: number, maxUnits = 1000, step = 1): ServiceDefinition {
  return {id, name, unit, unitPlural, defaultRate, maxUnits, step};
}

export const industries: Industry[] = [
  {
    id: 'cleaning', label: 'Cleaning', description: 'Home, office, and move-out cleaning.',
    services: [
      service('regular-clean', 'Regular clean', 'bedroom', 'bedrooms', 65, 20),
      service('deep-clean', 'Deep clean', 'bedroom', 'bedrooms', 95, 20),
      service('move-out-clean', 'Move-out clean', 'bedroom', 'bedrooms', 110, 20),
      service('office-clean', 'Office clean', 'hour', 'hours', 55, 20),
    ],
    fields: [
      {id: 'propertyType', label: 'Property type', type: 'select', options: ['Apartment', 'Condo', 'Townhouse', 'Detached home', 'Office', 'Other']},
      {id: 'address', label: 'Service address', type: 'text', placeholder: 'Street address and city'},
    ],
  },
  {
    id: 'landscaping', label: 'Landscaping', description: 'Lawn care, gardens, and outdoor projects.',
    services: [
      service('lawn-care', 'Lawn care', 'hour', 'hours', 65, 1000, 0.25),
      service('garden-maintenance', 'Garden maintenance', 'hour', 'hours', 75, 1000, 0.25),
      service('yard-cleanup', 'Yard cleanup', 'hour', 'hours', 85, 1000, 0.25),
      service('landscape-project', 'Landscape project', 'project', 'projects', 850, 100),
    ],
    fields: [
      {id: 'address', label: 'Service address', type: 'text', required: true, placeholder: 'Street address and city'},
      {id: 'area', label: 'Outdoor area (sq ft)', type: 'number', placeholder: 'Approximate area'},
    ],
  },
  {
    id: 'trades', label: 'Trades & repairs', description: 'Repair visits, installations, and maintenance.',
    services: [
      service('handyman', 'Handyman services', 'hour', 'hours', 85, 1000, 0.25),
      service('plumbing', 'Plumbing', 'hour', 'hours', 120, 1000, 0.25),
      service('electrical', 'Electrical work', 'hour', 'hours', 130, 1000, 0.25),
      service('repair-visit', 'Repair visit', 'visit', 'visits', 95, 100),
    ],
    fields: [
      {id: 'jobType', label: 'Job type', type: 'select', required: true, options: ['Repair', 'Installation', 'Maintenance', 'Inspection', 'Other']},
      {id: 'urgency', label: 'Urgency', type: 'select', required: true, options: ['Routine', 'Soon', 'Urgent']},
      {id: 'address', label: 'Job address', type: 'text', required: true, placeholder: 'Street address and city'},
    ],
  },
  {
    id: 'automotive', label: 'Auto detailing', description: 'Vehicle cleaning, detailing, and fleet care.',
    services: [
      service('exterior-wash', 'Exterior wash', 'vehicle', 'vehicles', 45, 100),
      service('interior-detail', 'Interior detail', 'vehicle', 'vehicles', 120, 100),
      service('full-detail', 'Full detail', 'vehicle', 'vehicles', 180, 100),
    ],
    fields: [
      {id: 'vehicleMake', label: 'Vehicle make', type: 'text', required: true, placeholder: 'e.g. Toyota'},
      {id: 'vehicleModel', label: 'Vehicle model', type: 'text', required: true, placeholder: 'e.g. Corolla'},
    ],
  },
  {
    id: 'events', label: 'Events', description: 'Event planning, catering, and venue setup.',
    services: [
      service('event-coordination', 'Event coordination', 'hour', 'hours', 95, 1000, 0.25),
      service('catering', 'Catering', 'guest', 'guests', 35, 100000),
      service('event-setup', 'Event setup', 'hour', 'hours', 55, 1000, 0.25),
    ],
    fields: [
      {id: 'eventDate', label: 'Event date', type: 'date', required: true},
      {id: 'location', label: 'Event location', type: 'text', required: true, placeholder: 'Venue or address'},
      {id: 'guestCount', label: 'Expected guests', type: 'number', placeholder: 'Approximate guest count'},
    ],
  },
  {
    id: 'professional', label: 'Professional services', description: 'Consulting, project work, and business support.',
    services: [
      service('consulting', 'Consulting', 'hour', 'hours', 150, 1000, 0.25),
      service('project-work', 'Project work', 'project', 'projects', 1000, 100),
      service('business-support', 'Business support', 'hour', 'hours', 65, 1000, 0.25),
    ],
    fields: [
      {id: 'brief', label: 'Project brief', type: 'text', required: true, placeholder: 'What would you like to achieve?'},
      {id: 'deadline', label: 'Project deadline', type: 'date'},
    ],
  },
  {
    id: 'general', label: 'General services', description: 'Customize services, prices, and units for your business.',
    services: [
      service('general-service', 'General service', 'job', 'jobs', 100),
      service('hourly-service', 'Hourly service', 'hour', 'hours', 75, 1000, 0.25),
    ],
    fields: [{id: 'description', label: 'Job description', type: 'text', required: true, placeholder: 'Describe the service you need'}],
  },
];

export function getIndustry(id?: IndustryId): Industry {
  return industries.find(industry => industry.id === id) ?? industries[0];
}

export function getCatalog(settings: Settings): ServiceDefinition[] {
  return settings.catalog ?? getIndustry(settings.industry).services;
}

export function getServiceRate(settings: Settings, service: ServiceDefinition): number {
  return settings.rates[service.id] ?? settings.rates[service.name] ?? service.defaultRate;
}

export function createIndustrySettings(id: IndustryId, previous?: Settings): Settings {
  const catalog = structuredClone(getIndustry(id).services);
  return {
    industry: id,
    catalog,
    rates: Object.fromEntries(catalog.map(item => [item.id, item.defaultRate])),
    taxPercent: previous?.taxPercent ?? 13,
    followupHours: previous?.followupHours ?? 48,
  };
}

export function getLeadUnit(lead: Pick<Lead, 'service' | 'unit' | 'unitPlural'>): {unit: string; unitPlural: string} {
  if (lead.unit && lead.unitPlural) return {unit: lead.unit, unitPlural: lead.unitPlural};
  if (lead.service === 'Office clean') return {unit: 'hour', unitPlural: 'hours'};
  if (industries[0].services.some(item => item.name === lead.service)) return {unit: 'bedroom', unitPlural: 'bedrooms'};
  return {unit: 'unit', unitPlural: 'units'};
}

export function formatQuantity(lead: Pick<Lead, 'service' | 'units' | 'unit' | 'unitPlural'>): string {
  const {unit, unitPlural} = getLeadUnit(lead);
  return `${lead.units} ${lead.units === 1 ? unit : unitPlural}`;
}
