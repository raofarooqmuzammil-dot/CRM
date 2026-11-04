export const ZONES = [
  ['America/New_York', 'US Eastern'], ['America/Chicago', 'US Central'], ['America/Denver', 'US Mountain'],
  ['America/Phoenix', 'US Mountain (Arizona)'], ['America/Los_Angeles', 'US Pacific'], ['Europe/London', 'UK'],
  ['Australia/Sydney', 'AU Sydney / Melbourne'], ['Australia/Brisbane', 'AU Brisbane'],
  ['Australia/Adelaide', 'AU Adelaide'], ['Australia/Perth', 'AU Perth'],
];
export const TEAM_ZONES = [['UTC', 'UTC'], ['Asia/Karachi', 'Pakistan'], ...ZONES];
export const zoneLabel = (v) => ZONES.find(([z]) => z === v)?.[1] || v || '';

export function localTime(zone, now = new Date()) {
  if (!zone) return '';
  try { return new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', timeZone: zone }).format(now); }
  catch { return ''; }
}
export function inHours(zone, hours, now = new Date()) {
  try {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: zone, weekday: 'short', hour: 'numeric', hourCycle: 'h23' }).formatToParts(now);
    const wd = parts.find((p) => p.type === 'weekday').value;
    const h = Number(parts.find((p) => p.type === 'hour').value);
    return !['Sat', 'Sun'].includes(wd) && h >= hours.start && h < hours.end;
  } catch { return false; }
}
export const zonesInHours = (hours, now) => ZONES.map(([z]) => z).filter((z) => inHours(z, hours, now));

// Midnight at the start of today (or of this week, Monday) in a time zone, as a Date.
function offsetMs(zone, date) {
  const p = new Intl.DateTimeFormat('en-US', { timeZone: zone, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' }).formatToParts(date);
  const v = Object.fromEntries(p.map((x) => [x.type, Number(x.value)]));
  return Date.UTC(v.year, v.month - 1, v.day, v.hour, v.minute, v.second) - date.getTime();
}
function midnight(zone, y, m, d) {
  const guess = Date.UTC(y, m - 1, d);
  let t = guess - offsetMs(zone, new Date(guess));
  t = guess - offsetMs(zone, new Date(t));
  return new Date(t);
}
export function startOfToday(zone, now = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: 'numeric', day: 'numeric' }).formatToParts(now).map((x) => [x.type, Number(x.value)]));
  return midnight(zone, parts.year, parts.month, parts.day);
}
export function startOfWeek(zone, now = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: 'numeric', day: 'numeric' }).formatToParts(now).map((x) => [x.type, Number(x.value)]));
  const wd = new Intl.DateTimeFormat('en-US', { timeZone: zone, weekday: 'short' }).format(now);
  const back = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 }[wd] || 0;
  const d = new Date(Date.UTC(parts.year, parts.month - 1, parts.day - back));
  return midnight(zone, d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
}
