'use client';
import { useState } from 'react';

const local = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);

export default function LogCall({ action, personId, outcomes, hint }) {
  const [outcome, setOutcome] = useState('');
  const [when, setWhen] = useState('');
  const preset = (days) => {
    const d = new Date();
    d.setDate(d.getDate() + days);
    d.setHours(10, 0, 0, 0);
    setWhen(local(d));
  };
  return (
    <form action={async (fd) => { await action(fd); setOutcome(''); setWhen(''); }}>
      <input type="hidden" name="person_id" value={personId} />
      <input type="hidden" name="outcome" value={outcome} />
      <input type="hidden" name="next_at" value={when ? new Date(when).toISOString() : ''} />
      <div className="outcomes">
        {outcomes.map((o) => (
          <button type="button" key={o.id} className={'ghost' + (outcome === o.name ? ' on' : '')}
            onClick={() => setOutcome(o.name)}>{o.name}</button>
        ))}
      </div>
      <div className="grid">
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
