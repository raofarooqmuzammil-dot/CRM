'use client';
import { useState } from 'react';
import Papa from 'papaparse';

const BASE = [
  ['skip', 'Skip this column'], ['person.name', 'Person name'], ['org.name', 'Organization (company) name'],
  ['phone', 'Phone'], ['email', 'Email'], ['org.country', 'Country'], ['org.website', 'Website'],
  ['org.address', 'Address'], ['notes', 'Add to notes'],
];
function guess(h) {
  const s = h.toLowerCase();
  if (/company|business|organi[sz]ation|^org/.test(s)) return 'org.name';
  if (/phone|tel|mobile/.test(s)) return 'phone';
  if (/e-?mail/.test(s)) return 'email';
  if (/country/.test(s)) return 'org.country';
  if (/website|url|site|domain/.test(s)) return 'org.website';
  if (/address|location|city/.test(s)) return 'org.address';
  if (/name|contact|person/.test(s)) return 'person.name';
  return 'skip';
}

export default function ImportWizard({ fields, startBatch, importChunk, finishBatch }) {
  const [file, setFile] = useState(null);
  const [data, setData] = useState(null);
  const [map, setMap] = useState({});
  const [nf, setNf] = useState({});
  const [st, setSt] = useState({ phase: 'idle', done: 0, stats: null, error: '' });

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
  const running = st.phase === 'running';

  const run = async () => {
    setSt({ phase: 'running', done: 0, stats: null, error: '' });
    try {
      const { batchId, mapping, labelIds } = await startBatch({ fileName: file.name, mapping: map, newFields: nf });
      try { localStorage.setItem('callcrm-map:' + data.headers.join('|'), JSON.stringify(mapping)); } catch {}
      const total = { created: 0, merged: 0, flagged: 0, skipped: 0 };
      for (let i = 0; i < data.rows.length; i += 100) {
        const r = await importChunk({ batchId, mapping, labelIds, rows: data.rows.slice(i, i + 100) });
        Object.keys(total).forEach((k) => { total[k] += r[k]; });
        setSt((s) => ({ ...s, done: Math.min(i + 100, data.rows.length) }));
      }
      await finishBatch({ batchId, stats: total });
      setSt({ phase: 'done', done: data.rows.length, stats: total, error: '' });
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
          {!useful && <p className="error">Match at least one column to a name, company, phone, or email.</p>}
          <p className="muted">Records with the same phone or email as one already here are merged: empty fields get filled and nothing is deleted. Same company name with a different phone is imported and tagged Possible duplicate.</p>
          <button disabled={!useful || running} onClick={run}>{running ? `Importing... ${st.done} of ${data.rows.length}` : `Import ${data.rows.length} rows`}</button>
          {st.error && <p className="error">{st.error}</p>}
          {st.phase === 'done' && (
            <p><strong>Done.</strong> {st.stats.created} new, {st.stats.merged} merged into existing records, {st.stats.flagged} tagged Possible duplicate, {st.stats.skipped} skipped (empty rows). <a href="/persons">View persons</a></p>
          )}
        </section>
      )}
    </>
  );
}
