export const PAGE_SIZES = [50, 100, 200];
export const DEFAULT_PAGE_SIZE = 100;

export function pageSize(sp) {
  const n = Number(sp?.n);
  return PAGE_SIZES.includes(n) ? n : DEFAULT_PAGE_SIZE;
}
// Search parameters as plain strings (Next can give arrays), safe to pass to a client component.
export function cleanSp(sp) {
  return Object.fromEntries(Object.entries(sp || {}).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v]).filter(([, v]) => typeof v === 'string'));
}
// 1 2 3 ... 10 11 12 style list of page numbers around the current page.
export function pageNumbers(page, last) {
  const keep = new Set([1, 2, last - 1, last, page - 1, page, page + 1].filter((n) => n >= 1 && n <= last));
  const out = []; let prev = 0;
  for (const n of [...keep].sort((a, b) => a - b)) { if (n - prev > 1) out.push('…'); out.push(n); prev = n; }
  return out;
}
