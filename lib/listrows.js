import { localTime } from './zones';
import { relTime } from './format';

const resultOf = (name, outcomes) => (name ? { text: name, color: outcomes.find((o) => o.name === name)?.color || '#66726f' } : null);
const calledText = (at, by, owner, now) => (at ? `${relTime(at, now)}${owner.get(by) ? ' by ' + owner.get(by) : ''}` : 'Not called yet');

// Plain rows for the List view of organizations.
export function orgListRows(orgs, { next = new Map(), people = [], lists = [], outcomes = [], now = Date.now() }) {
  const owner = new Map(people.map((p) => [p.id, p.full_name]));
  const listBy = new Map(lists.map((l) => [l.id, l]));
  return orgs.map((o) => {
    const list = listBy.get(o.list_id);
    return {
      id: o.id, href: `/organizations/${o.id}`, name: o.name,
      flag: o.do_not_call ? 'dnc' : o.possible_duplicate ? 'dup' : '',
      tags: [
        list && { text: list.name, color: list.color },
        o.do_not_call && { text: 'Do not call', warn: true },
        o.possible_duplicate && { text: 'Possible duplicate', warn: true },
        o.visible_to === 'private' && { text: 'Private' },
      ].filter(Boolean),
      phone: o.phone || '', sub: [localTime(o.time_zone), o.country].filter(Boolean).join(' · '),
      result: resultOf(o.last_outcome, outcomes), called: calledText(o.last_called_at, o.last_called_by, owner, now),
      calls: o.call_count || 0, followup: next.get(o.id) || null, owner: owner.get(o.owner_id) || '',
      extra: o.persons?.[0]?.count ? `${o.persons[0].count} contact${o.persons[0].count > 1 ? 's' : ''}` : '',
    };
  });
}

// Plain rows for the List view of persons (contacts).
export function personListRows(persons, { next = new Map(), people = [], outcomes = [], now = Date.now() }) {
  const owner = new Map(people.map((p) => [p.id, p.full_name]));
  return persons.map((p) => ({
    id: p.id, href: `/persons/${p.id}`, name: p.name,
    flag: p.do_not_call ? 'dnc' : p.possible_duplicate ? 'dup' : '',
    tags: [
      p.do_not_call && { text: 'Do not call', warn: true },
      p.possible_duplicate && { text: 'Possible duplicate', warn: true },
      p.visible_to === 'private' && { text: 'Private' },
    ].filter(Boolean),
    phone: p.phone || '', sub: localTime(p.eff_time_zone),
    org: p.organizations ? { text: p.organizations.name, href: `/organizations/${p.organizations.id}` } : null, role: p.role || '',
    result: resultOf(p.last_outcome, outcomes), called: calledText(p.last_called_at, p.last_called_by, owner, now),
    calls: p.call_count || 0, followup: next.get(p.id) || null, owner: owner.get(p.owner_id) || '', extra: '',
  }));
}
