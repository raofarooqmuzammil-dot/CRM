'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { PAGE_SIZES, pageNumbers } from '../lib/pager';

// Numbered pages, a jump-to-page box, and a rows-per-page choice that is remembered on this browser.
export default function Pager({ path, sp, page, lastPage, total, size }) {
  const router = useRouter();
  const [jump, setJump] = useState('');
  const href = (changes) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...sp, ...changes })) if (v !== undefined && v !== null && v !== '') p.set(k, String(v));
    const q = p.toString();
    return q ? `${path}?${q}` : path;
  };
  useEffect(() => {
    try {
      const saved = Number(localStorage.getItem('callcrm-page-size'));
      if (!sp.n && PAGE_SIZES.includes(saved) && saved !== size) router.replace(href({ n: saved, page: '' }));
    } catch {}
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (!total) return null;
  const setSize = (e) => {
    try { localStorage.setItem('callcrm-page-size', e.target.value); } catch {}
    router.push(href({ n: e.target.value, page: '' }));
  };
  const go = (e) => {
    e.preventDefault();
    const n = Math.min(Math.max(1, Number(jump) || 1), lastPage);
    router.push(href({ page: n }));
  };
  return (
    <div className="pager">
      {page > 1 ? <Link href={href({ page: page - 1 })}>Previous</Link> : <span className="muted">Previous</span>}
      <span className="pages">
        {pageNumbers(page, lastPage).map((n, i) => (n === '…'
          ? <span key={'g' + i} className="muted">…</span>
          : n === page ? <strong key={n} className="here">{n}</strong> : <Link key={n} href={href({ page: n })}>{n}</Link>))}
      </span>
      {page < lastPage ? <Link href={href({ page: page + 1 })}>Next</Link> : <span className="muted">Next</span>}
      <form className="jump" onSubmit={go}>
        <input value={jump} onChange={(e) => setJump(e.target.value)} inputMode="numeric" placeholder={`Page (1 to ${lastPage})`} aria-label="Jump to page" />
        <button type="submit" className="ghost">Go</button>
      </form>
      <label className="rows">Rows
        <select value={size} onChange={setSize}>{PAGE_SIZES.map((n) => <option key={n} value={n}>{n}</option>)}</select>
      </label>
    </div>
  );
}
