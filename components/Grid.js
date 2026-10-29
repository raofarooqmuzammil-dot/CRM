'use client';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import LocalTime from './LocalTime';
import Pager from './Pager';
import { updateCell, moveToList } from '../app/actions/grid';

const INPUT = { text: 'text', number: 'number', date: 'date', link: 'text' };

function EditableCell({ col, value, labelFor, onCommit, status, row }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const cancelled = useRef(false);
  const start = () => { cancelled.current = false; setDraft(value ?? ''); setEditing(true); };
  const finish = () => {
    setEditing(false);
    if (!cancelled.current && String(draft) !== String(value ?? '')) onCommit(draft);
  };

  if (editing && col.type === 'select') {
    return (
      <select autoFocus className="cell-in" value={value ?? ''}
        onChange={(e) => { setEditing(false); onCommit(e.target.value); }} onBlur={() => setEditing(false)}>
        {col.options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    );
  }
  if (editing) {
    return (
      <input autoFocus className="cell-in" type={INPUT[col.type] || 'text'} step={col.type === 'number' ? 'any' : undefined}
        value={draft} onChange={(e) => setDraft(e.target.value)} onBlur={finish}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { e.preventDefault(); finish(); }
          if (e.key === 'Escape') { cancelled.current = true; setEditing(false); }
        }} />
    );
  }
  const shown = col.type === 'select' ? labelFor(value) : value;
  const cls = 'cell' + (status === 'saving' ? ' saving' : status === 'saved' ? ' saved' : status?.error ? ' err' : '');
  return (
    <div className={cls} tabIndex={0} role="gridcell" title={status?.error || ''} onClick={start}
      onKeyDown={(e) => { if (e.key === 'Enter') start(); }}>
      {shown}
      {col.open && <Link className="mini" href={row.href} onClick={(e) => e.stopPropagation()}>open</Link>}
      {col.tel && value && <a className="mini" href={`tel:${value}`} onClick={(e) => e.stopPropagation()}>call</a>}
      {col.type === 'link' && value && (
        <a className="mini" href={/^https?:\/\//i.test(value) ? value : 'https://' + value} target="_blank" rel="noreferrer"
          onClick={(e) => e.stopPropagation()}>visit</a>
      )}
      {status?.error && <span className="errtext"> {status.error}</span>}
    </div>
  );
}

function LabelsCell({ ids, labels, onCommit }) {
  const byId = new Map(labels.map((l) => [l.id, l]));
  const chosen = ids.map((i) => byId.get(i)).filter(Boolean);
  const toggle = (id) => onCommit(ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]);
  return (
    <details className="cell-labels">
      <summary>
        {chosen.length
          ? chosen.map((l) => <span className="tag" key={l.id} style={{ background: l.color + '26', color: l.color }}>{l.name}</span>)
          : <span className="muted">&nbsp;</span>}
      </summary>
      <div className="menu">
        {labels.map((l) => (
          <label className="check" key={l.id}>
            <input type="checkbox" checked={ids.includes(l.id)} onChange={() => toggle(l.id)} /> {l.name}
          </label>
        ))}
        {!labels.length && <span className="muted">No labels yet</span>}
      </div>
    </details>
  );
}

export default function Grid({ entity, columns, rows, labels, lists, storageKey, sortHrefs, sort, dir, addHref, total, from, to, pager }) {
  const [data, setData] = useState(rows);
  const [status, setStatus] = useState({});
  const [sel, setSel] = useState([]);
  const [target, setTarget] = useState('');
  const [bulkMsg, setBulkMsg] = useState('');
  const [hidden, setHidden] = useState(() => columns.filter((c) => c.defaultHidden).map((c) => c.key));
  useEffect(() => { setData(rows); setSel([]); }, [rows]);
  useEffect(() => {
    try { const s = JSON.parse(localStorage.getItem(storageKey) || 'null'); if (Array.isArray(s)) setHidden(s); } catch {}
  }, [storageKey]);

  const shown = columns.filter((c) => !hidden.includes(c.key));
  const toggleCol = (key) => {
    const next = hidden.includes(key) ? hidden.filter((k) => k !== key) : [...hidden, key];
    setHidden(next);
    try { localStorage.setItem(storageKey, JSON.stringify(next)); } catch {}
  };

  const commit = async (row, col, value) => {
    const k = row.id + col.key;
    const before = row.cells[col.key];
    const set = (v) => setData((d) => d.map((r) => (r.id === row.id ? { ...r, cells: { ...r.cells, [col.key]: v } } : r)));
    set(value);
    setStatus((s) => ({ ...s, [k]: 'saving' }));
    const res = await updateCell({ entity, id: row.id, field: col.field, value });
    if (res?.ok) {
      setStatus((s) => ({ ...s, [k]: 'saved' }));
      setTimeout(() => setStatus((s) => (s[k] === 'saved' ? { ...s, [k]: null } : s)), 1500);
    } else {
      set(before);
      setStatus((s) => ({ ...s, [k]: { error: res?.error || 'Could not save' } }));
      setTimeout(() => setStatus((s) => ({ ...s, [k]: null })), 4000);
    }
  };

  const bulkMove = async () => {
    setBulkMsg('Moving...');
    const res = await moveToList({ ids: sel, listId: target });
    if (res.ok) {
      setData((d) => d.map((r) => (sel.includes(r.id) ? { ...r, cells: { ...r.cells, list: target } } : r)));
      setBulkMsg(`Moved ${res.moved} to ${target ? lists.find((l) => l.id === target)?.name : 'no list'}`);
      setSel([]);
    } else setBulkMsg(res.error);
  };
  const labelFor = (col) => (v) => (col.options.find(([x]) => x === (v ?? ''))?.[1]) ?? v ?? '';

  const render = (row, col) => {
    const v = row.cells[col.key];
    const pick = lists && col.key === 'name'
      ? <input type="checkbox" className="rowpick" aria-label="Select row" checked={sel.includes(row.id)}
          onChange={(e) => setSel((x) => (e.target.checked ? [...x, row.id] : x.filter((i) => i !== row.id)))} />
      : null;
    const st = status[row.id + col.key];
    switch (col.type) {
      case 'ro-link': return <div className="ro">{v ? <Link href={v.href}>{v.text}</Link> : ''}</div>;
      case 'ro-calls': return <div className="ro">{v.n}{v.last && <span className="muted"> · {v.last}</span>}</div>;
      case 'ro-time': return <div className="ro">{v ? <LocalTime iso={v} /> : <span className="muted">None</span>}</div>;
      case 'ro': return <div className="ro">{v}</div>;
      case 'labels': return <LabelsCell ids={v || []} labels={labels} onCommit={(x) => commit(row, col, x)} />;
      case 'boolean':
        return <div className="cell"><input type="checkbox" checked={Boolean(v)} onChange={(e) => commit(row, col, e.target.checked)} /></div>;
      default:
        return <div className="withpick">{pick}<EditableCell col={col} value={v} row={row} status={st} labelFor={col.type === 'select' ? labelFor(col) : undefined}
          onCommit={(x) => commit(row, col, x)} /></div>;
    }
  };

  return (
    <>
      <div className="gridbar">
        <details className="colmenu">
          <summary className="btn-like">Columns</summary>
          <div className="menu">
            {columns.filter((c) => !c.frozen).map((c) => (
              <label className="check" key={c.key}>
                <input type="checkbox" checked={!hidden.includes(c.key)} onChange={() => toggleCol(c.key)} /> {c.label}
              </label>
            ))}
          </div>
        </details>
        {sel.length > 0 && lists && (
          <span className="bulkbar">
            {sel.length} selected. Move to
            <select value={target} onChange={(e) => setTarget(e.target.value)} aria-label="List">
              <option value="">No list</option>
              {lists.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
            <button type="button" onClick={bulkMove}>Move</button>
            <button type="button" className="ghost" onClick={() => setSel([])}>Clear</button>
          </span>
        )}
        {bulkMsg && <span className="muted">{bulkMsg}</span>}
        <span className="muted">{total ? `Showing ${from}–${to} of ${total}` : 'No results'}</span>
      </div>
      <div className="gridwrap">
        <table className="gridtable">
          <thead>
            <tr>
              {shown.map((c) => (
                <th key={c.key} className={c.frozen ? 'sticky-col' : ''}>
                  {c.sort ? <Link href={sortHrefs[c.key]}>{c.label}{sort === c.sort ? (dir === 'asc' ? ' ▲' : ' ▼') : ''}</Link> : c.label}
                </th>
              ))}
              <th className="addcol"><Link href={addHref} title="Add a column">+</Link></th>
            </tr>
          </thead>
          <tbody>
            {data.map((row) => (
              <tr key={row.id} className={row.flags.dnc ? 'row-dnc' : row.flags.dup ? 'row-dup' : ''}>
                {shown.map((c) => <td key={c.key} className={c.frozen ? 'sticky-col' : ''}>{render(row, c)}</td>)}
                <td />
              </tr>
            ))}
            {!data.length && <tr><td colSpan={shown.length + 1} className="empty">Nothing here yet.</td></tr>}
          </tbody>
        </table>
      </div>
      {pager && <Pager {...pager} />}
    </>
  );
}
