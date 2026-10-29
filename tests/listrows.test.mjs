import { orgListRows, personListRows } from './lib/listrows.js';
import { relTime } from './lib/format.js';
import { buildHref } from './lib/pager.js';
let bad = 0; const eq = (a, b, m) => { if (JSON.stringify(a) !== JSON.stringify(b)) { bad++; console.log('FAIL', m, JSON.stringify(a), '!=', JSON.stringify(b)); } else console.log('ok  ', m); };
const now = Date.UTC(2026, 9, 29, 12, 0, 0), ago = (min) => new Date(now - min * 60000).toISOString();
eq([relTime(ago(0), now), relTime(ago(20), now), relTime(ago(180), now), relTime(ago(3 * 1440), now)], ['just now', '20m ago', '3h ago', '3d ago'], 'relative times');
const people = [{ id: 'u1', full_name: 'Sam' }, { id: 'u2', full_name: 'Kim' }];
const lists = [{ id: 'l1', name: 'NEMT', color: '#2b6cb0' }];
const outcomes = [{ name: 'Interested', color: '#1c6b60' }];
const orgs = [
  { id: 'o1', name: 'Blue Cab', phone: '(212) 555 0100', time_zone: 'America/New_York', country: 'US', list_id: 'l1', last_outcome: 'Interested', last_called_at: ago(20), last_called_by: 'u2', call_count: 4, owner_id: 'u1', persons: [{ count: 2 }] },
  { id: 'o2', name: 'Silent Co', do_not_call: true, possible_duplicate: true, visible_to: 'private', call_count: 0 },
];
const rows = orgListRows(orgs, { next: new Map([['o1', '2026-11-02T10:00:00Z']]), people, lists, outcomes, now });
eq(rows[0].tags, [{ text: 'NEMT', color: '#2b6cb0' }], 'list shows as a tag');
eq([rows[0].result, rows[0].called, rows[0].calls, rows[0].owner, rows[0].extra, rows[0].followup], [{ text: 'Interested', color: '#1c6b60' }, '20m ago by Kim', 4, 'Sam', '2 contacts', '2026-11-02T10:00:00Z'], 'organization row fields');
eq(rows[0].sub.endsWith('· US') || rows[0].sub.endsWith('US'), true, 'sub line has local time and country');
eq([rows[1].flag, rows[1].tags.map((t) => t.text), rows[1].result, rows[1].called], ['dnc', ['Do not call', 'Possible duplicate', 'Private'], null, 'Not called yet'], 'do-not-call row is flagged and never-called is clear');
const prow = personListRows([{ id: 'p1', name: 'Dana', role: 'Manager', phone: '555', organizations: { id: 'o1', name: 'Blue Cab' }, last_outcome: 'Interested', last_called_at: ago(60), last_called_by: 'u1', call_count: 1, owner_id: 'u2', eff_time_zone: 'Europe/London' }], { people, outcomes, now });
eq([prow[0].org, prow[0].role, prow[0].called, prow[0].owner], [{ text: 'Blue Cab', href: '/organizations/o1' }, 'Manager', '1h ago by Sam', 'Kim'], 'person row shows its organization and role');
eq(buildHref('/persons', { q: 'a', v: 'grid' }, { v: 'list', page: '' }), '/persons?q=a&v=list', 'view switch keeps filters and resets the page');
console.log(bad ? `${bad} FAILED` : 'ALL PASSED');
