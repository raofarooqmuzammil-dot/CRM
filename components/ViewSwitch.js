'use client';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { buildHref } from '../lib/pager';

// List | Grid switch. The choice is remembered on this browser.
export default function ViewSwitch({ path, sp, view }) {
  const router = useRouter();
  useEffect(() => {
    try {
      const saved = localStorage.getItem('callcrm-view');
      if (!sp.v && (saved === 'list' || saved === 'grid') && saved !== view) router.replace(buildHref(path, sp, { v: saved }));
    } catch {}
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const go = (v) => {
    try { localStorage.setItem('callcrm-view', v); } catch {}
    router.push(buildHref(path, sp, { v, page: '' }));
  };
  return (
    <div className="seg" role="group" aria-label="View">
      <button type="button" className={view === 'list' ? 'on' : ''} onClick={() => go('list')}>List</button>
      <button type="button" className={view === 'grid' ? 'on' : ''} onClick={() => go('grid')}>Grid</button>
    </div>
  );
}
