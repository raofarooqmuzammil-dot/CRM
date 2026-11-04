export function relTime(iso, now = Date.now()) {
  const m = Math.round((now - new Date(iso)) / 60000);
  return m < 1 ? 'just now' : m < 60 ? `${m}m ago` : m < 1440 ? `${Math.round(m / 60)}h ago` : `${Math.round(m / 1440)}d ago`;
}

export const isInterested = (name) => String(name || '').trim().toLowerCase() === 'interested';
export const isNotInterested = (name) => String(name || '').trim().toLowerCase() === 'not interested';
// "was Interested 2d ago", shown when the latest result is no longer Interested.
export function wasInterested(lastInterestedAt, lastOutcome, now = Date.now()) {
  if (!lastInterestedAt || !lastOutcome || isInterested(lastOutcome)) return '';
  return `was Interested ${relTime(lastInterestedAt, now)}`;
}
