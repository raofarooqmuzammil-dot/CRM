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
