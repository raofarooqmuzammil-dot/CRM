'use client';
import { useState } from 'react';

const local = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);

export default function ScheduleForm({ action, personId }) {
  const [when, setWhen] = useState('');
  const preset = (days) => {
    const d = new Date();
    d.setDate(d.getDate() + days);
    d.setHours(10, 0, 0, 0);
    setWhen(local(d));
  };
  return (
    <form className="grid" action={async (fd) => { await action(fd); setWhen(''); }}>
      <input type="hidden" name="person_id" value={personId} />
      <input type="hidden" name="due_at" value={when ? new Date(when).toISOString() : ''} />
      <label>What<input name="title" defaultValue="Follow-up call" required /></label>
      <label>Type
        <select name="type">
          <option value="call">Call</option><option value="follow-up">Follow-up</option>
          <option value="meeting">Meeting</option><option value="demo">Demo</option>
        </select>
      </label>
      <label>When<input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} required /></label>
      <label>Location<input name="location" /></label>
      <label>Note<input name="description" /></label>
      <label className="check"><input name="video_call" type="checkbox" /> Video call</label>
      <div className="presets">
        <button type="button" className="ghost" onClick={() => preset(1)}>Tomorrow</button>
        <button type="button" className="ghost" onClick={() => preset(3)}>In 3 days</button>
        <button type="button" className="ghost" onClick={() => preset(7)}>In a week</button>
      </div>
      <button type="submit">Schedule</button>
    </form>
  );
}
