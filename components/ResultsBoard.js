'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import LocalTime from './LocalTime';
import { createDealFromOrg } from '../app/actions/results';

const KEY = 'callcrm-results-hidden';

export default function ResultsBoard({ columns, hasPipeline }) {
  const [hidden, setHidden] = useState([]);
  const [active, setActive] = useState(columns[0]?.key);
  useEffect(() => { try { const s = JSON.parse(localStorage.getItem(KEY) || 'null'); if (Array.isArray(s)) setHidden(s); } catch {} }, []);
  const toggle = (k) => {
    const next = hidden.includes(k) ? hidden.filter((x) => x !== k) : [...hidden, k];
    setHidden(next);
    try { localStorage.setItem(KEY, JSON.stringify(next)); } catch {}
  };
  const shown = columns.filter((c) => !hidden.includes(c.key));
  const current = shown.some((c) => c.key === active) ? active : shown[0]?.key;

  return (
    <>
      <div className="gridbar">
        <details className="colmenu">
          <summary className="btn-like">Columns</summary>
          <div className="menu">
            {columns.map((c) => (
              <label className="check" key={c.key}>
                <input type="checkbox" checked={!hidden.includes(c.key)} onChange={() => toggle(c.key)} /> {c.name} ({c.count})
              </label>
            ))}
          </div>
        </details>
      </div>
      <div className="coltabs">
        {shown.map((c) => (
          <button type="button" key={c.key} className={'ghost' + (current === c.key ? ' on' : '')} onClick={() => setActive(c.key)}>
            {c.name} ({c.count})
          </button>
        ))}
      </div>
      <div className="rboard">
        {shown.map((c) => (
          <section className={'rcol' + (c.hot ? ' hot' : '') + (current === c.key ? ' active' : '')} key={c.key}>
            <h2>{c.name} ({c.count})</h2>
            {c.viewAllHref && c.count > c.cards.length && <p className="muted"><Link href={c.viewAllHref}>View all {c.count}</Link></p>}
            <div className="cards">
              {c.cards.map((o) => (
                <article className="rcard" key={o.id}>
                  <Link href={`/organizations/${o.id}`}><strong>{o.name}</strong></Link>
                  <div>
                    {o.phone && <a href={`tel:${o.phone}`}>{o.phone}</a>}
                    {o.localTime && <span className="muted"> · {o.localTime}</span>}
                    {o.list && <span className="tag" style={{ background: o.list.color + '26', color: o.list.color, marginLeft: 6 }}>{o.list.name}</span>}
                  </div>
                  <div className="muted">
                    {o.calledText}{o.calls > 0 && ` · ${o.calls} calls`}
                    {o.followup && <> · Follow-up <LocalTime iso={o.followup} /></>}
                  </div>
                  {c.hot && (o.dealId
                    ? <Link href={`/deals/${o.dealId}`}>View deal</Link>
                    : hasPipeline && (
                      <form action={createDealFromOrg}><input type="hidden" name="id" value={o.id} />
                        <button className="ghost small" type="submit">Create deal</button></form>
                    ))}
                </article>
              ))}
              {!c.cards.length && <p className="muted">Nothing here</p>}
            </div>
          </section>
        ))}
      </div>
    </>
  );
}
