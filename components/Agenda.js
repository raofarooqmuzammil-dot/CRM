'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import LocalTime from './LocalTime';

export default function Agenda({ items, markDone }) {
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  if (!ready) return null;

  const start = new Date(); start.setHours(0, 0, 0, 0);
  const end = new Date(start); end.setDate(end.getDate() + 1);
  const at = (i) => new Date(i.due_at);
  const groups = [
    ['Overdue', items.filter((i) => at(i) < start), 'late'],
    ['Today', items.filter((i) => at(i) >= start && at(i) < end), ''],
    ['Upcoming', items.filter((i) => at(i) >= end), ''],
  ].filter(([, list]) => list.length);

  if (!groups.length) {
    return <p className="panel empty">Nothing scheduled. Open a person and schedule a follow-up.</p>;
  }
  return groups.map(([title, list, cls]) => (
    <section className="panel" key={title}>
      <h2 className={cls}>{title} ({list.length})</h2>
      <table>
        <tbody>
          {list.map((i) => (
            <tr key={i.id}>
              <td className="when"><LocalTime iso={i.due_at} /></td>
              <td>{i.title}{i.description && <div className="muted">{i.description}</div>}</td>
              <td>
                {i.person
                  ? <Link href={`/persons/${i.person.id}`}>{i.person.name}</Link>
                  : i.org && <Link href={`/organizations/${i.org.id}`}>{i.org.name}</Link>}
                {i.deal && <div className="muted">Deal: <Link href={`/deals/${i.deal.id}`}>{i.deal.title}</Link></div>}
                {(i.person?.organizations?.name || (i.person && i.org?.name)) && <div className="muted">{i.person?.organizations?.name || i.org?.name}</div>}
              </td>
              <td>{(i.person?.phone || i.org?.phone) && <a href={`tel:${i.person?.phone || i.org.phone}`}>{i.person?.phone || i.org.phone}</a>}</td>
              <td>
                <form action={markDone}>
                  <input type="hidden" name="id" value={i.id} />
                  <button className="ghost" type="submit">Done</button>
                </form>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  ));
}
