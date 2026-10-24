import { ZONES, localTime } from './zones';

export const PAGE_SIZE = 50;

const customCols = (cfields) => cfields.map((f) => ({
  key: 'cf_' + f.id, label: f.name, field: 'custom:' + f.id,
  type: f.type === 'dropdown' ? 'select' : f.type,
  options: f.type === 'dropdown' ? [['', 'Not set'], ...f.options.map((o) => [o, o])] : undefined,
}));
const customCells = (cfields, custom) => Object.fromEntries(cfields.map((f) => [
  'cf_' + f.id, f.type === 'boolean' ? Boolean(custom?.[f.id]) : (custom?.[f.id] ?? ''),
]));
const ownerOptions = (people) => [['', 'None'], ...people.map((p) => [p.id, p.full_name])];

export function personColumns(cfields, people) {
  return [
    { key: 'name', label: 'Name', type: 'text', field: 'name', sort: 'name', frozen: true, open: true },
    { key: 'org', label: 'Organization', type: 'ro-link' },
    { key: 'phone', label: 'Phone', type: 'text', field: 'phone', sort: 'phone', tel: true },
    { key: 'local_time', label: 'Local time', type: 'ro' },
    { key: 'labels', label: 'Labels', type: 'labels', field: 'label_ids' },
    { key: 'calls', label: 'Calls', type: 'ro-calls', sort: 'calls' },
    { key: 'followup', label: 'Next follow-up', type: 'ro-time' },
    { key: 'owner', label: 'Owner', type: 'select', field: 'owner_id', options: ownerOptions(people) },
    { key: 'email', label: 'Email', type: 'text', field: 'email', defaultHidden: true },
    { key: 'time_zone', label: 'Time zone', type: 'select', field: 'time_zone', options: [['', 'Same as organization'], ...ZONES], defaultHidden: true },
    { key: 'notes', label: 'Notes', type: 'text', field: 'notes', defaultHidden: true },
    ...customCols(cfields),
  ];
}
export function personRows(list, { cfields, next }) {
  return list.map((p) => ({
    id: p.id, href: `/persons/${p.id}`,
    flags: { dup: Boolean(p.possible_duplicate), dnc: Boolean(p.do_not_call) },
    cells: {
      name: p.name, org: p.organizations ? { text: p.organizations.name, href: `/organizations/${p.organizations.id}` } : null,
      phone: p.phone || '', local_time: localTime(p.eff_time_zone), labels: p.label_ids || [],
      calls: { n: p.call_count || 0, last: p.last_outcome || '' }, followup: next.get(p.id) || null,
      owner: p.owner_id || '', email: p.email || '', time_zone: p.time_zone || '', notes: p.notes || '',
      ...customCells(cfields, p.custom),
    },
  }));
}

export function orgColumns(cfields, people) {
  return [
    { key: 'name', label: 'Name', type: 'text', field: 'name', sort: 'name', frozen: true, open: true },
    { key: 'people', label: 'People', type: 'ro' },
    { key: 'phone', label: 'Phone', type: 'text', field: 'phone', tel: true },
    { key: 'website', label: 'Website', type: 'link', field: 'website' },
    { key: 'country', label: 'Country', type: 'select', field: 'country', sort: 'country',
      options: [['', 'Not set'], ['US', 'United States'], ['UK', 'United Kingdom'], ['AU', 'Australia']] },
    { key: 'labels', label: 'Labels', type: 'labels', field: 'label_ids' },
    { key: 'owner', label: 'Owner', type: 'select', field: 'owner_id', options: ownerOptions(people) },
    { key: 'address', label: 'Address', type: 'text', field: 'address', defaultHidden: true },
    { key: 'time_zone', label: 'Time zone', type: 'select', field: 'time_zone', options: [['', 'Not set'], ...ZONES], defaultHidden: true },
    ...customCols(cfields),
  ];
}
export function orgRows(list, { cfields }) {
  return list.map((o) => ({
    id: o.id, href: `/organizations/${o.id}`, flags: {},
    cells: {
      name: o.name, people: String(o.persons?.[0]?.count ?? 0), phone: o.phone || '', website: o.website || '',
      country: o.country || '', labels: o.label_ids || [], owner: o.owner_id || '',
      address: o.address || '', time_zone: o.time_zone || '', ...customCells(cfields, o.custom),
    },
  }));
}

// Builds a link to the same page with some query parameters changed. An empty value removes a parameter.
export function pageHref(path, sp, changes) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...sp, ...changes })) if (v !== undefined && v !== null && v !== '') p.set(k, String(v));
  const q = p.toString();
  return q ? `${path}?${q}` : path;
}
export function sortHrefs(path, sp, columns) {
  return Object.fromEntries(columns.filter((c) => c.sort).map((c) => [
    c.key, pageHref(path, sp, { sort: c.sort, dir: sp.sort === c.sort && sp.dir === 'asc' ? 'desc' : 'asc', page: '' }),
  ]));
}
