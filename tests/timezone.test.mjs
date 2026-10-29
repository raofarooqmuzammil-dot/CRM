import { makeFake } from './fake.mjs';
import { guessZone, parseZone } from './lib/tzguess.js';
import { localTime, inHours, zonesInHours } from './lib/zones.js';
const eq = (a, b, m) => { if (a !== b) { console.log('FAIL', m, a, b); process.exitCode = 1; } else console.log('ok  ', m); };
eq(guessZone({ phone: '(212) 555-0100', country: 'US' }), 'America/New_York', 'NYC area code');
eq(guessZone({ phone: '+1 310 555 0100' }), 'America/Los_Angeles', 'LA area code');
eq(guessZone({ phone: '555 0100', address: '12 Main St, Austin, TX 78701' }), 'America/Chicago', 'Texas address');
eq(guessZone({ phone: '+44 20 7946 0958' }), 'Europe/London', 'UK phone');
eq(guessZone({ phone: '+61 2 9374 4000' }), 'Australia/Sydney', 'AU phone');
eq(guessZone({ country: 'AU', address: 'Perth WA 6000' }), 'Australia/Perth', 'AU state WA is Perth');
eq(guessZone({ phone: '123' }), null, 'unknown stays blank');
eq(parseZone('PST'), 'America/Los_Angeles', 'parse PST'); eq(parseZone('Central Time'), 'America/Chicago', 'parse central');
eq(parseZone('Australia/Perth'), 'Australia/Perth', 'parse IANA');
const mon10amNY = new Date('2026-10-26T14:00:00Z'); // Monday 10:00 New York
eq(inHours('America/New_York', { start: 9, end: 17 }, mon10amNY), true, 'Monday 10am NY in hours');
eq(inHours('America/Los_Angeles', { start: 9, end: 17 }, new Date('2026-10-26T14:00:00Z')), false, 'Monday 7am LA outside');
eq(inHours('America/New_York', { start: 9, end: 17 }, new Date('2026-10-24T15:00:00Z')), false, 'Saturday outside');
eq(localTime('America/New_York', mon10amNY), '10:00 AM', 'local time text');

const sb = makeFake(); globalThis.__sb = sb;
const { startBatch, importChunk } = await import('./import.mjs');
const { checkDuplicates, quickAdd } = await import('./quickadd.mjs');
const H = (o) => ({ Name: '', Company: '', Phone: '', Country: '', Address: '', TZ: '', ...o });
const mapping = { Name: 'org.name', Company: 'org.name', Phone: 'phone', Country: 'org.country', Address: 'org.address', TZ: 'time_zone' };
const { batchId, mapping: m, labelIds } = await startBatch({ fileName: 't.csv', mapping, newFields: {} });
const res = await importChunk({ batchId, mapping: m, labelIds, rows: [
  H({ Company: 'NY Deli', Phone: '(212) 555 0100', Country: 'US' }),
  H({ Company: 'LA Shop', Phone: '555 0111', TZ: 'Pacific' }),
  H({ Company: 'London Pub', Phone: '+44 20 7946 0000', Country: 'UK' }),
  H({ Name: 'Solo Person', Phone: '(310) 555 0123' }),
] });
const org = (n) => sb.db.organizations.find((o) => o.name === n);
eq(org('NY Deli').time_zone + '|' + org('NY Deli').time_zone_guessed, 'America/New_York|true', 'import guesses and flags');
eq(org('LA Shop').time_zone + '|' + org('LA Shop').time_zone_guessed, 'America/Los_Angeles|false', 'import uses sheet value, not flagged');
eq(org('London Pub').time_zone + '|' + org('London Pub').time_zone_guessed, 'Europe/London|false', 'UK from country, not flagged');
const solo = sb.db.organizations.find((o) => o.name === 'Solo Person');
eq(solo.time_zone + '|' + solo.time_zone_guessed, 'America/Los_Angeles|true', 'row with only a name still gets a guessed zone');

// Quick add + duplicate check
sb.db.persons.push({ id: 'p-sam', name: 'Sam Smith', name_key: 'sam smith', phone: '(555) 222-3333', phone_key: '552223333', email: null, email_key: null, last_called_at: new Date().toISOString(), last_outcome: 'No answer', custom: {}, label_ids: [] });
const d = await checkDuplicates({ phone: '555-222-3333', company: 'Nothing Co' });
eq(d.persons.length + ':' + d.persons[0].why, '1:phone', 'duplicate check finds a contact with the same phone');
const q1 = await quickAdd({ company: 'Fresh Bakery', phone: '(415) 555 0188', country: 'US' });
eq(q1.flagged, false, 'quick add new business not flagged');
const q2 = await quickAdd({ company: 'Other Bakery', phone: '555 222 3333', country: 'US', name: 'Another' });
eq(q2.flagged, true, 'quick add with same phone flagged');
const rec = sb.db.organizations.find((o) => o.id === q2.id);
eq(rec.possible_duplicate, true, 'quick add record carries the duplicate flag');
eq(rec.duplicate_of_person, 'p-sam', 'flag links to the matching contact');
const bak = sb.db.organizations.find((o) => o.name === 'Fresh Bakery');
eq(bak.time_zone + '|' + bak.time_zone_guessed, 'America/Los_Angeles|true', 'quick add guesses zone from area code');
console.log(process.exitCode ? 'SOME FAILED' : 'ALL PASSED');
