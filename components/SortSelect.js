'use client';
import { useRouter } from 'next/navigation';
import { buildHref } from '../lib/pager';

export default function SortSelect({ path, sp, value, options }) {
  const router = useRouter();
  return (
    <label className="sortsel">Sort by
      <select value={value} onChange={(e) => router.push(buildHref(path, sp, { s: e.target.value, page: '' }))}>
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </label>
  );
}
