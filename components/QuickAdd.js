'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

const EMPTY = { company: '', phone: '', country: 'US', name: '', email: '', notes: '', time_zone: '', list_id: '', new_list_name: '' };
const ago = (iso) => {
  const m = Math.round((Date.now() - new Date(iso)) / 60000);
  return m < 60 ? `${m} minutes ago` : m < 1440 ? `${Math.round(m / 60)} hours ago` : `${Math.round(m / 1440)} days ago`;
};

export default function QuickAdd({ zones, lists, checkDuplicates, quickAdd }) {
  const router = useRouter();
  const [f, setF] = useState(EMPTY);
  const [dups, setDups] = useState(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(null);
  const [error, setError] = useState('');
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));

  useEffect(() => {
    const digits = f.phone.replace(/\D/g, '').length;
    if (digits < 7 && f.company.trim().length < 3 && !f.email.includes('@')) { setDups(null); return; }
    const t = setTimeout(async () => {
      try { setDups(await checkDuplicates({ phone: f.phone, email: f.email, company: f.company })); } catch {}
    }, 400);
    return () => clearTimeout(t);
  }, [f.phone, f.email, f.company, checkDuplicates]);

  const found = dups && (dups.persons.length || dups.orgs.length);
  const why = { phone: 'same phone', email: 'same email', org: 'same name' };
  const save = (open) => async (e) => {
    e.preventDefault();
    setBusy(true); setError('');
    try {
      const r = await quickAdd({ ...f, list_id: f.list_id === '__new__' ? '' : f.list_id, new_list_name: f.list_id === '__new__' ? f.new_list_name : '' });
      router.refresh();
      if (open) { router.push(`/organizations/${r.id}?call=1`); return; }
      setSaved({ id: r.id, name: f.company, flagged: r.flagged });
      setF(EMPTY); setDups(null);
    } catch (err) { setError('Could not save. ' + (err.message || '')); }
    setBusy(false);
  };

  return (
    <>
      {saved && <p className="panel notice">Saved <Link href={`/organizations/${saved.id}`}>{saved.name}</Link>{saved.flagged && ' and flagged it as a possible duplicate'}.</p>}
      <form className="panel grid" onSubmit={save(false)}>
        <label>Company name *<input value={f.company} onChange={set('company')} required autoFocus /></label>
        <label>Phone *<input value={f.phone} onChange={set('phone')} type="tel" required /></label>
        <label>Country *
          <select value={f.country} onChange={set('country')}>
            <option value="US">United States</option><option value="UK">United Kingdom</option><option value="AU">Australia</option>
          </select>
        </label>
        <label>List (industry)
          <select value={f.list_id} onChange={set('list_id')}><option value="">No list</option>
            {lists.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            <option value="__new__">+ New list...</option></select>
        </label>
        {f.list_id === '__new__' && <label>New list name<input value={f.new_list_name} onChange={set('new_list_name')} required /></label>}
        <label>Contact name (optional)<input value={f.name} onChange={set('name')} /></label>
        <label>Email<input value={f.email} onChange={set('email')} type="email" /></label>
        <label>Time zone
          <select value={f.time_zone} onChange={set('time_zone')}>
            <option value="">Guess automatically</option>
            {zones.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </label>
        <label>Notes<input value={f.notes} onChange={set('notes')} /></label>
        <button type="submit" disabled={busy}>Save</button>
        <button type="button" className="ghost" disabled={busy || !f.company || !f.phone} onClick={save(true)}>Save and call</button>
      </form>
      {error && <p className="error">{error}</p>}
      {found ? (
        <section className="panel dup">
          <h2>Already in the system</h2>
          {dups.orgs.map((o) => (
            <p key={o.id}>
              <Link href={`/organizations/${o.id}`}>{o.name}</Link> ({why[o.why]}). Owner: {o.owner?.full_name || 'none'}.
              {o.last_called_at ? ` Last called ${ago(o.last_called_at)} (${o.last_outcome}).` : ' Not called yet.'}
            </p>
          ))}
          {dups.persons.map((p) => (
            <p key={p.id}>
              Contact <Link href={`/persons/${p.id}`}>{p.name}</Link> ({why[p.why]}){p.organizations && <> at <Link href={`/organizations/${p.organizations.id}`}>{p.organizations.name}</Link></>}. Owner: {p.owner?.full_name || 'none'}.
            </p>
          ))}
          <p className="muted">You can still save. The new record will carry an orange duplicate tag.</p>
        </section>
      ) : null}
    </>
  );
}
