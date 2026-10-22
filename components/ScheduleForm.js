'use client';
import { useState } from 'react';

const local = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);

// Used to schedule a new activity, or to edit one (pass `initial`).
export default function ScheduleForm({ action, personId, types, initial, submitLabel = 'Schedule' }) {
  const [when, setWhen] = useState(initial ? local(new Date(initial.due_at)) : '');
  const preset = (days) => {
    const d = new Date();
    d.setDate(d.getDate() + days);
    d.setHours(10, 0, 0, 0);
    setWhen(local(d));
  };
  const names = (types || []).map((t) => t.name);
  if (initial && !names.includes(initial.type)) names.push(initial.type);
  return (
    <form className="grid" action={async (fd) => { await action(fd); if (!initial) setWhen(''); }}>
      {initial && <input type="hidden" name="id" value={initial.id} />}
      {personId && <input type="hidden" name="person_id" value={personId} />}
      <input type="hidden" name="due_at" value={when ? new Date(when).toISOString() : ''} />
      <label>What<input name="title" defaultValue={initial?.title ?? 'Follow-up call'} required /></label>
      <label>Type
        <select name="type" defaultValue={initial?.type ?? names[0]}>
          {names.map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
      </label>
      <label>When<input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} required /></label>
      <label>Location<input name="location" defaultValue={initial?.location ?? ''} /></label>
      <label>Note<input name="description" defaultValue={initial?.description ?? ''} /></label>
      <label className="check"><input name="video_call" type="checkbox" defaultChecked={initial?.video_call} /> Video call</label>
      <div className="presets">
        <button type="button" className="ghost" onClick={() => preset(1)}>Tomorrow</button>
        <button type="button" className="ghost" onClick={() => preset(3)}>In 3 days</button>
        <button type="button" className="ghost" onClick={() => preset(7)}>In a week</button>
      </div>
      <button type="submit">{submitLabel}</button>
    </form>
  );
}
