import { makeFake } from './fake.mjs';
import { findOrCreateList } from './lib/lists.js';
import { resolveDealLinks } from './lib/deals.js';
let bad = 0; const eq = (a, b, m) => { if (JSON.stringify(a) !== JSON.stringify(b)) { bad++; console.log('FAIL', m, JSON.stringify(a), '!=', JSON.stringify(b)); } else console.log('ok  ', m); };
const sb = makeFake(); globalThis.__sb = sb;
const a = await findOrCreateList(sb, 'NEMT'); const b = await findOrCreateList(sb, 'nemt'); const c = await findOrCreateList(sb, '  NEMT ');
eq([a === b, b === c, sb.db.lists.length], [true, true, 1], 'a list is never duplicated by case or spaces');
eq(await findOrCreateList(sb, '   '), null, 'empty name makes no list');
const { createList } = await import('./lists.mjs');
const fd = (o) => ({ get: (k) => o[k] ?? null });
let url = ''; try { await createList(fd({ name: 'Roofers', color: '#b7791f' })); } catch (e) { url = e.url; }
const roof = sb.db.lists.find((l) => l.name === 'Roofers');
eq(url, '/organizations?list=' + roof.id, 'creating a list opens its tab');
let threw = ''; try { await createList(fd({ name: ' ' })); } catch (e) { threw = e.message; } eq(threw, 'Enter a list name', 'blank list name refused');
const { quickAdd } = await import('./quickadd.mjs');
const q = await quickAdd({ company: 'Fresh Roof Co', phone: '(415) 555 0188', country: 'US', new_list_name: 'ROOFERS' });
eq(sb.db.organizations.find((o) => o.id === q.id).list_id, roof.id, 'quick add with a new list name reuses the existing list');
await quickAdd({ company: 'Brand New Co', phone: '(415) 555 0199', country: 'US', new_list_name: 'HVAC' });
eq(sb.db.lists.map((l) => l.name), ['NEMT', 'Roofers', 'HVAC'], 'quick add can create a new list');
// deals: names instead of dropdowns
const l1 = await resolveDealLinks(sb, 'Acme Transport', 'Dana', 'u1');
const l2 = await resolveDealLinks(sb, 'acme transport', 'dana', 'u1');
eq([l1.organization_id === l2.organization_id, l1.person_id === l2.person_id], [true, true], 'same names reuse the same organization and contact');
eq(sb.db.organizations.filter((o) => o.name === 'Acme Transport').length, 1, 'no duplicate organization');
const l3 = await resolveDealLinks(sb, '', '', 'u1'); eq(l3, { organization_id: null, person_id: null }, 'blank names link nothing');
const l4 = await resolveDealLinks(sb, 'Acme Transport', 'Mike', 'u1'); eq(l4.organization_id === l1.organization_id && l4.person_id !== l1.person_id, true, 'a second contact joins the same organization');
const l5 = await resolveDealLinks(sb, '', 'Solo', 'u1'); eq(sb.db.persons.find((p) => p.id === l5.person_id).organization_id ?? null, null, 'contact without organization');
console.log(bad ? `${bad} FAILED` : 'ALL PASSED');
