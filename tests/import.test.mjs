import { makeFake } from './fake.mjs';
let bad = 0; const eq = (a, b, m) => { if (JSON.stringify(a) !== JSON.stringify(b)) { bad++; console.log('FAIL', m, JSON.stringify(a), '!=', JSON.stringify(b)); } else console.log('ok  ', m); };
const sb = makeFake(); globalThis.__sb = sb;
const { startBatch, importChunk } = await import('./import.mjs');
const { checkDuplicates, quickAdd } = await import('./quickadd.mjs');
const { moveToList } = await import('./grid.mjs');
sb.db.custom_fields.push({ id: 'f-ig', entity: 'organization', type: 'text' });
// existing data
sb.db.organizations.push({ id: 'o-old', name: 'Old Transport', name_key: 'old transport', phone: '(555) 123-4567', phone_key: '551234567', email_key: null, custom: {}, label_ids: [] });
sb.db.persons.push({ id: 'p-old', name: 'Old Manager', name_key: 'old manager', phone: '555 777 8888', phone_key: '557778888', email: 'mgr@old.com', email_key: 'mgr@old.com', organization_id: 'o-old', custom: {}, label_ids: [] });
const H = (o) => ({ Business: '', Phone: '', Email: '', Website: '', State: '', ContactName: '', ContactPhone: '', Ig: '', ...o });
const mapping = { Business: 'org.name', Phone: 'phone', Email: 'email', Website: 'org.website', State: 'org.address', ContactName: 'person.name', ContactPhone: 'person.phone', Ig: 'cf:f-ig' };
const b = await startBatch({ fileName: 'nemt.csv', mapping, newFields: {}, newListName: 'NEMT' });
const rows = [
  H({ Business: 'Blue Cab', Phone: '(212) 555 0100', Website: 'bluecab.com', State: 'New York, NY', Ig: '@bluecab' }),     // plain business, no contact
  H({ Business: 'Green Ride', Phone: '+1 310 555 0111', ContactName: 'Dana', ContactPhone: '310 555 0222' }),              // business + contact
  H({ Business: 'Green Ride', Phone: '310-555-0111', ContactName: 'Mike' }),                                              // same business again: second contact
  H({ Business: 'Red Van', Phone: '(555) 123-4567' }),                                                                    // same phone as existing org
  H({ Business: 'Yellow Taxi', Phone: '555 000 9999', ContactPhone: '555 777 8888' }),                                    // contact phone = existing contact
  H({ Business: 'Old Transport', Phone: '555 444 0000' }),                                                                // same name as existing org, new phone
  H({ Business: 'Blue Cab', Phone: '555 222 3333' }),                                                                     // same name inside the file, different phone
  H({}),                                                                                                                  // empty
];
const r = await importChunk({ batchId: b.batchId, mapping: b.mapping, labelIds: b.labelIds, listId: b.listId, rows });
console.log('result', JSON.stringify(r));
const lab = Object.fromEntries(sb.db.labels.map((l) => [l.id, l.name.replace('Duplicate: same ', '')]));
const O = sb.db.organizations.filter((o) => o.import_batch_id);
for (const o of O) console.log('  org', o.name.padEnd(12), (o.phone || '-').padEnd(16), 'list:', o.list_id ? 'NEMT' : '-', 'flag:', o.possible_duplicate, (o.label_ids || []).map((i) => lab[i]).join(','), o.duplicate_of_org ? '-> ' + o.duplicate_of_org : '');
for (const p of sb.db.persons.filter((p) => p.import_batch_id)) console.log('  person', p.name, 'at', sb.db.organizations.find((o) => o.id === p.organization_id)?.name);
const nemt = sb.db.lists.find((l) => l.name === 'NEMT');
eq(O.every((o) => o.list_id === nemt.id), true, 'every organization put in the NEMT list');
eq(O.filter((o) => o.name === 'Green Ride').length, 1, 'same business twice = one organization');
eq(sb.db.persons.filter((p) => p.import_batch_id && p.organization_id === O.find((o) => o.name === 'Green Ride').id).length, 2, 'both contacts attached to it');
eq(sb.db.persons.filter((p) => p.import_batch_id).map((p) => p.name).sort(), ['555 777 8888', 'Dana', 'Mike'], 'persons only where the row had contact details (none for plain businesses)');
eq(O.find((o) => o.name === 'Blue Cab' && o.phone === '(212) 555 0100').possible_duplicate, false, 'first Blue Cab not flagged');
eq(O.find((o) => o.phone === '(555) 123-4567').label_ids.map((i) => lab[i]), ['phone'], 'same phone as existing org flagged');
eq(O.find((o) => o.phone === '(555) 123-4567').duplicate_of_org, 'o-old', 'flag links to existing org');
const yc = sb.db.persons.find((p) => p.name === '555 777 8888');
eq(yc.possible_duplicate + '|' + yc.duplicate_of, 'true|p-old', 'contact whose phone matches an existing contact is flagged and linked');
eq(O.find((o) => o.name === 'Yellow Taxi').possible_duplicate, false, 'its organization is not flagged');
eq(O.find((o) => o.name === 'Old Transport').label_ids.map((i) => lab[i]), ['organization'], 'same name as existing org flagged');
eq(O.find((o) => o.phone === '555 222 3333').possible_duplicate, true, 'same business name inside file with another phone flagged');
eq(sb.db.persons.find((p) => p.name === 'Dana').custom, {}, 'contact custom empty');
eq(O.find((o) => o.name === 'Blue Cab' && o.website).custom['f-ig'], '@bluecab', 'organization custom field filled');
eq(r.created + ':' + r.contacts + ':' + r.skipped, '6:3:1', 'counts');
// move to list
const U1 = '323e4567-e89b-12d3-a456-426614174001', U2 = '323e4567-e89b-12d3-a456-426614174002', L2 = '423e4567-e89b-12d3-a456-426614174003';
sb.db.organizations.push({ id: U1, name: 'A', list_id: null, custom: {}, label_ids: [] }, { id: U2, name: 'B', list_id: null, custom: {}, label_ids: [] });
const mv = await moveToList({ ids: [U1, U2], listId: L2 });
eq(mv.ok + ':' + mv.moved, 'true:2', 'bulk move to a list');
eq(sb.db.organizations.filter((o) => o.list_id === L2).length, 2, 'both organizations now in the Roofers list');
eq((await moveToList({ ids: [U1], listId: '' })).ok, true, 'bulk move to no list'); eq(sb.db.organizations.find((o) => o.id === U1).list_id, null, 'list cleared');
eq((await moveToList({ ids: ['x'], listId: '' })).ok, false, 'bulk move refuses bad ids');
// quick add
const q1 = await quickAdd({ company: 'Fresh Bakery', phone: '(415) 555 0188', country: 'US', name: 'Pat', list_id: null });
eq(q1.flagged, false, 'quick add new business not flagged');
const fb = sb.db.organizations.find((o) => o.name === 'Fresh Bakery');
eq(fb.time_zone + '|' + fb.time_zone_guessed, 'America/Los_Angeles|true', 'quick add guesses time zone');
eq(sb.db.persons.some((p) => p.name === 'Pat' && p.organization_id === fb.id), true, 'quick add contact created and linked');
eq(sb.db.persons.some((p) => p.name === 'Fresh Bakery'), false, 'quick add makes no placeholder person');
const d = await checkDuplicates({ phone: '555 123 4567', company: 'Other' });
eq(d.orgs.map((o) => o.why), ['phone', 'phone'], 'duplicate check finds both organizations with that phone');
const q2 = await quickAdd({ company: 'Another Co', phone: '555-123-4567', country: 'US' });
eq(q2.flagged, true, 'quick add duplicate flagged');
console.log(bad ? `${bad} FAILED` : 'ALL PASSED');
