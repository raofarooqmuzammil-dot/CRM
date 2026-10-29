import Link from 'next/link';
import LocalTime from './LocalTime';

// Roomy one-line-per-record list, made for scanning and calling.
export default function RowList({ rows, empty }) {
  if (!rows.length) return <p className="panel empty">{empty}</p>;
  return (
    <ul className="rowlist">
      {rows.map((r) => (
        <li key={r.id} className={'lrow ' + r.flag}>
          <div className="main">
            <Link href={r.href}><strong>{r.name}</strong></Link>
            {r.tags.map((t) => (
              <span key={t.text} className={'tag' + (t.warn ? ' warn' : '')} style={t.color ? { background: t.color + '26', color: t.color } : undefined}>{t.text}</span>
            ))}
            <div className="sub">
              {r.phone && <a className="phone" href={`tel:${r.phone}`}>{r.phone}</a>}
              {r.sub && <span className="muted"> · {r.sub}</span>}
            </div>
            {r.org && <div className="sub muted">at <Link href={r.org.href}>{r.org.text}</Link>{r.role && ` · ${r.role}`}</div>}
            {!r.org && r.role && <div className="sub muted">{r.role}</div>}
          </div>
          <div>{r.result
            ? <span className="badge" style={{ background: r.result.color + '26', color: r.result.color }}>{r.result.text}</span>
            : <span className="muted">Not called</span>}</div>
          <div className="muted">{r.called}{r.calls > 0 && ` · ${r.calls} calls`}</div>
          <div>{r.followup ? <>Follow-up <LocalTime iso={r.followup} /></> : <span className="muted">No follow-up</span>}</div>
          <div className="muted">{r.owner}{r.extra && <div>{r.extra}</div>}</div>
        </li>
      ))}
    </ul>
  );
}
