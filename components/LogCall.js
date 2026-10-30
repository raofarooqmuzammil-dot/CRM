'use client';
import { useState } from 'react';

const local = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);

// `contacts` and `roles` turn on the "Who did you speak to?" question (used on an organization).
export default function LogCall({ action, personId, outcomes, hint, contacts, roles, hidden }) {
  const [outcome, setOutcome] = useState('');
  const [when, setWhen] = useState('');
  const [who, setWho] = useState('');
  const preset = (days) => {
    const d = new Date();
    d.setDate(d.getDate() + days);
    d.setHours(10, 0, 0, 0);
    setWhen(local(d));
  };
  return (
    <form action={async (fd) => { await action(fd); setOutcome(''); setWhen(''); setWho(''); }}>
      {personId && <input type="hidden" name="person_id" value={personId} />}
      {hidden && Object.entries(hidden).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      <input type="hidden" name="outcome" value={outcome} />
      <input type="hidden" name="who" value={who} />
      <input type="hidden" name="next_at" value={when ? new Date(when).toISOString() : ''} />
      <div className="outcomes">
        {outcomes.map((o) => (
          <button type="button" key={o.id} className={'ghost' + (outcome === o.name ? ' on' : '')}
            onClick={() => setOutcome(o.name)}>{o.name}</button>
        ))}
      </div>
      <div className="grid">
        {contacts && (
          <label>Who did you speak to?
            <select value={who} onChange={(e) => setWho(e.target.value)}>
              <option value="">Not sure</option>
              <optgroup label="Role">
                {(roles || []).map((r) => <option key={r.id} value={'role:' + r.name}>{r.name}</option>)}
              </optgroup>
              {contacts.length > 0 && (
                <optgroup label="Contacts at this organization">
                  {contacts.map((c) => <option key={c.id} value={'contact:' + c.id}>{c.name}{c.role ? ` (${c.role})` : ''}</option>)}
                </optgroup>
              )}
              <option value="new">+ New contact...</option>
            </select>
          </label>
        )}
        {contacts && (who === '' || who.startsWith('role:')) && (
          <label>Name (if you got it)<input name="spoke_name" placeholder="Dana" /></label>
        )}
        {contacts && who === 'new' && (
          <>
            <label>Contact name<input name="new_name" required /></label>
            <label>Role
              <select name="new_role" defaultValue="">
                <option value="">Not set</option>
                {(roles || []).map((r) => <option key={r.id} value={r.name}>{r.name}</option>)}
              </select>
            </label>
            <label>Phone<input name="new_phone" type="tel" /></label>
          </>
        )}
        <label>Note<input name="note" /></label>
        <label>Next follow-up (optional)
          <input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />
        </label>
        <div className="presets">
          <button type="button" className="ghost" onClick={() => preset(1)}>Tomorrow</button>
          <button type="button" className="ghost" onClick={() => preset(3)}>In 3 days</button>
          <button type="button" className="ghost" onClick={() => preset(7)}>In a week</button>
        </div>
        <button type="submit" disabled={!outcome}>Log call</button>
      </div>
      {hint && <p className="muted">{hint}</p>}
    </form>
  );
}
