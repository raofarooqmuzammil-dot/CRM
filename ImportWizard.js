'use client';
import { useState } from 'react';
import Papa from 'papaparse';

const BASE = [
  ['skip', 'Skip this column'],
  ['org.name', 'Organization (company) name'], ['phone', 'Organization phone'], ['email', 'Organization email'],
  ['org.website', 'Website'], ['org.address', 'Address'], ['org.country', 'Country'], ['time_zone', 'Time zone'],
  ['list', 'List (industry)'],
  ['person.name', 'Contact name (creates a person)'], ['person.phone', 'Contact phone'], ['person.email', 'Contact email'],
  ['notes', 'Add to notes'],
];
function guess(h) {
  const s = h.toLowerCase();
  if (/contact.*(phone|mobile|cell)|direct|cell/.test(s)) return 'person.phone';
  if (/contact.*e-?mail/.test(s)) return 'person.email';
  if (/contact|person|owner|manager|first name|full name/.test(s)) return 'person.name';
  if (/company|business|organi[sz]ation|^org|^name$/.test(s)) return 'org.name';
  if (/phone|tel|mobile/.test(s)) return 'phone';
  if (/e-?mail/.test(s)) return 'email';
  if (/time ?zone|^tz$/.test(s)) return 'time_zone';
  if (/country/.test(s)) return 'org.country';
  if (/website|url|site|domain/.test(s)) return 'org.website';
  if (/address|location|city/.test(s)) return 'org.address';
  if (/^list$|industry|category|niche/.test(s)) return 'list';
  return 'skip';
}

export default function ImportWizard({ fields, lists, startBatch, importChunk, finishBatch }) {
  const [file, setFile] = useState(null);
  const [data, setData] = useState(null);
  const [map, setMap] = useState({});
  const [nf, setNf] = useState({});
  const [st, setSt] = useState({ phase: 'idle', done: 0, stats: null, error: '', listId: '' });
  const [listId, setListId] = useState('');
  const [newList, setNewList] = useState('');

  const onFile = (e) => {
    const f = e.target.files[0];
    if (!f) return;
    setFile(f);
    Papa.parse(f, {
      header: true, skipEmptyLines: true,
      complete: (res) => {
        const headers = res.meta.fields || [];
        let saved = null;
        try { saved = JSON.parse(localStorage.getItem('callcrm-map:' + headers.join('|')) || 'null'); } catch {}
        setData({ headers, rows: res.data });
        setMap(saved || Object.fromEntries(headers.map((h) => [h, guess(h)])));
        setNf(Object.fromEntries(headers.map((h) => [h, { name: h, entity: 'organization', type: 'text' }])));
        setSt({ phase: 'idle', done: 0, stats: null, error: '' });
      },
    });
  };

  const useful = data && Object.values(map).some((t) => ['person.name', 'org.name', 'phone', 'email'].includes(t));
  const val = (row, t) => (data ? data.headers.filter((h) => map[h] === t) : []).map((h) => String(row[h] ?? '').trim()).find(Boolean) || '';
  const summary = (() => {
    if (!data) return null;
    let orgs = 0, contacts = 0, skipped = 0; const samples = [];
    for (const row of data.rows) {
      const org = val(row, 'org.name') || val(row, 'person.name') || val(row, 'phone') || val(row, 'email');
      if (!org) { skipped++; continue; }
      orgs++;
      const c = val(row, 'person.name') || val(row, 'person.phone') || val(row, 'person.email');
      if (c) contacts++;
      if (samples.length < 3) samples.push({ org, c });
    }
    return { orgs, contacts, skipped, samples };
  })();
  const listName = newList.trim() || lists.find((l) => l.id === listId)?.name || 'no list';
  const running = st.phase === 'running';

  const run = async () => {
    setSt({ phase: 'running', done: 0, stats: null, error: '' });
    try {
      const { batchId, mapping, labelIds, listId: usedList } = await startBatch({ fileName: file.name, mapping: map, newFields: nf, listId, newListName: newList });
      try { localStorage.setItem('callcrm-map:' + data.headers.join('|'), JSON.stringify(mapping)); } catch {}
      const total = { created: 0, contacts: 0, flagged: 0, skipped: 0 };
      for (let i = 0; i < data.rows.length; i += 100) {
        const r = await importChunk({ batchId, mapping, labelIds, listId: usedList, rows: data.rows.slice(i, i + 100) });
        Object.keys(total).forEach((k) => { total[k] += r[k]; });
        setSt((s) => ({ ...s, done: Math.min(i + 100, data.rows.length) }));
      }
      await finishBatch({ batchId, stats: total });
      setSt({ phase: 'done', done: data.rows.length, stats: total, error: '', listId: usedList || '' });
    } catch (e) {
      setSt((s) => ({ ...s, phase: 'error', error: 'The import stopped part way. Rows already imported are kept, and an admin can undo the batch from the history below. ' + (e.message || '') }));
    }
  };

  const set = (h, k, v) => setNf((n) => ({ ...n, [h]: { ...n[h], [k]: v } }));
  return (
    <>
      <section className="panel">
        <label>Choose a CSV file<input type="file" accept=".csv,text/csv" onChange={onFile} /></label>
      </section>
      {data && (
        <section className="panel">
          <h2>Match your columns ({data.rows.length} rows)</h2>
          <table>
            <thead><tr><th>Your column</th><th>Example</th><th>Becomes</th></tr></thead>
            <tbody>
              {data.headers.map((h) => (
                <tr key={h}>
                  <td>{h}</td>
                  <td className="muted">{[data.rows[0]?.[h], data.rows[1]?.[h]].filter(Boolean).join(' | ')}</td>
                  <td>
                    <select value={map[h] || 'skip'} onChange={(e) => setMap((m) => ({ ...m, [h]: e.target.value }))}>
                      {BASE.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                      {['organization', 'person'].map((en) => (
                        <optgroup key={en} label={en === 'organization' ? 'Organization fields' : 'Person fields'}>
                          {fields.filter((f) => f.entity === en).map((f) => <option key={f.id} value={'cf:' + f.id}>{f.name}</option>)}
                        </optgroup>
                      ))}
                      <option value="new">Create new field...</option>
                    </select>
                    {map[h] === 'new' && nf[h] && (
                      <div className="row-form">
                        <input value={nf[h].name} onChange={(e) => set(h, 'name', e.target.value)} aria-label="Field name" />
                        <select value={nf[h].entity} onChange={(e) => set(h, 'entity', e.target.value)} aria-label="Belongs to">
                          <option value="organization">Organization</option><option value="person">Person</option>
                        </select>
                        <select value={nf[h].type} onChange={(e) => set(h, 'type', e.target.value)} aria-label="Type">
                          <option value="text">Text</option><option value="number">Number</option><option value="date">Date</option>
                          <option value="boolean">Yes / No</option><option value="link">Link</option>
                        </select>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="grid">
            <label>Which list is this file?
              <select value={listId} onChange={(e) => setListId(e.target.value)} disabled={Boolean(newList.trim())}>
                <option value="">No list (or use a List column)</option>
                {lists.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            </label>
            <label>Or create a new list<input value={newList} onChange={(e) => setNewList(e.target.value)} placeholder="NEMT, Roofers, HVAC..." /></label>
          </div>
          {summary && useful && (
            <div className="panel notice">
              <strong>Where this file will go</strong>
              <p>It will create <strong>{summary.orgs} organizations</strong> (the businesses you call) in <strong>{listName}</strong> and <strong>{summary.contacts} contact persons</strong> (named people at those businesses, only where your sheet has contact details). {summary.skipped > 0 && `${summary.skipped} rows have no name, phone, or email and will be skipped.`}</p>
              {summary.samples.map((s, i) => <p key={i} className="muted">{s.org} becomes Organization: {s.org}{s.c ? ` and Contact: ${s.c}` : ' with no contact person'}</p>)}
              <p className="muted">Callers work from the Organizations page. Add contacts to an organization when you learn a name or number.</p>
            </div>
          )}
          {!useful && <p className="error">Match at least one column to a company, phone, email, or contact name.</p>}
          <p className="muted">Each row becomes an organization. A contact person is created only where you matched a contact column. Rows without a time zone get a best guess from the address or phone, marked as guessed so you can check it. Nothing is merged. A row that matches an existing record on phone, email, person name, or organization name gets an orange Duplicate tag. Filter for them on the Persons page.</p>
          <button disabled={!useful || running} onClick={run}>{running ? `Importing... ${st.done} of ${data.rows.length}` : `Import ${data.rows.length} rows`}</button>
          {st.error && <p className="error">{st.error}</p>}
          {st.phase === 'done' && (
            <p><strong>Done.</strong> {st.stats.created} organizations and {st.stats.contacts} contacts imported, {st.stats.flagged} flagged as possible duplicates, {st.stats.skipped} skipped. <a href={st.listId ? `/organizations?list=${st.listId}` : '/organizations'}>View the organizations</a>{st.stats.contacts > 0 && <> or <a href="/persons">the contacts</a></>}.</p>
          )}
        </section>
      )}
    </>
  );
}
