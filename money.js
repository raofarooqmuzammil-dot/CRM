export const CURRENCIES = ['USD', 'GBP', 'AUD'];
export const money = (v, c) =>
  new Intl.NumberFormat('en', { style: 'currency', currency: c || 'USD', maximumFractionDigits: 0 }).format(Number(v) || 0);
export const totals = (list) => {
  const m = {};
  list.forEach((d) => { m[d.currency] = (m[d.currency] || 0) + Number(d.value || 0); });
  return Object.entries(m).filter(([, v]) => v > 0).map(([c, v]) => money(v, c)).join(' · ');
};
