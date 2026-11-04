// Builds the reminder emails. Pure functions, so they can be tested without sending anything.
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export function fmtTime(iso, tz, withDate = false) {
  const d = new Date(iso);
  const t = new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false }).format(d);
  if (!withDate) return t;
  return `${new Intl.DateTimeFormat('en-GB', { timeZone: tz, weekday: 'short', day: 'numeric', month: 'short' }).format(d)} ${t}`;
}

function aboutWhat(a, site) {
  if (a.org) return { name: a.org.name, phone: a.org.phone || a.person?.phone || '', href: `${site}/organizations/${a.org.id}` };
  if (a.person) return { name: a.person.name, phone: a.person.phone || '', href: `${site}/persons/${a.person.id}` };
  if (a.deal) return { name: a.deal.title, phone: '', href: `${site}/deals/${a.deal.id}` };
  return { name: a.title, phone: '', href: site };
}
const lineOf = (a, site, tz, withDate, who) => {
  const t = aboutWhat(a, site);
  const note = [a.title, a.description].filter(Boolean).join(' · ');
  return {
    text: `${fmtTime(a.due_at, tz, withDate)}${who ? ' ' + who : ''} - ${t.name}${t.phone ? ' ' + t.phone : ''} - ${note}\n  ${t.href}`,
    html: `<li><strong>${esc(fmtTime(a.due_at, tz, withDate))}</strong>${who ? ' ' + esc(who) : ''} - <a href="${esc(t.href)}">${esc(t.name)}</a>${t.phone ? ' ' + esc(t.phone) : ''} - ${esc(note)}</li>`,
  };
};
const wrap = (title, bodyHtml) => `<div style="font-family:Arial,sans-serif;font-size:15px;color:#1d2a29"><h2 style="margin:0 0 12px">${esc(title)}</h2>${bodyHtml}</div>`;

// kind: 'morning' (due today + overdue) or 'evening' (what is still not done today).
export function buildDigest({ kind, items, people, mineId, site, tz, start, end }) {
  const nameOf = (id) => people.find((p) => p.id === id)?.full_name || 'Unassigned';
  const at = (a) => new Date(a.due_at);
  const overdue = items.filter((a) => at(a) < start);
  const today = items.filter((a) => at(a) >= start && at(a) < end);
  const mine = (l) => l.filter((a) => a.assigned_to === mineId);
  const others = (l) => l.filter((a) => a.assigned_to !== mineId);
  const empty = kind === 'evening' ? today.length === 0 : items.length === 0;

  const team = [...new Set(others(items).map((a) => a.assigned_to))].map((id) => {
    const od = others(overdue).filter((a) => a.assigned_to === id), td = others(today).filter((a) => a.assigned_to === id);
    const oldest = od.length ? Math.max(...od.map((a) => Math.floor((start - at(a)) / 86400000) + 1)) : 0;
    return { id, name: nameOf(id), overdue: od.length, today: td.length, oldestDays: oldest, sample: od.slice(0, 3).map((a) => aboutWhat(a, site).name) };
  }).sort((a, b) => b.overdue - a.overdue || a.name.localeCompare(b.name));

  const myOver = mine(overdue), myToday = mine(today);
  const subject = kind === 'evening'
    ? `Still not done today: you ${myToday.length}, team ${others(today).length}`
    : `Follow-ups: you ${myToday.length} due and ${myOver.length} overdue, team ${others(today).length} due and ${others(overdue).length} overdue`;

  const section = (title, list, withDate) => {
    if (!list.length) return { text: '', html: '' };
    const lines = list.map((a) => lineOf(a, site, tz, withDate));
    return { text: `${title}\n${lines.map((l) => l.text).join('\n')}\n\n`, html: `<h3 style="margin:14px 0 6px">${esc(title)}</h3><ul>${lines.map((l) => l.html).join('')}</ul>` };
  };
  const parts = kind === 'evening'
    ? [section(`Yours, still not done today (${myToday.length})`, myToday, false)]
    : [section(`Yours, overdue (${myOver.length})`, myOver, true), section(`Yours, due today (${myToday.length})`, myToday, false)];
  const teamLines = team.filter((t) => (kind === 'evening' ? t.today : t.overdue + t.today) > 0).map((t) => (kind === 'evening'
    ? `${t.name}: ${t.today} still not done today`
    : `${t.name}: ${t.overdue} overdue${t.oldestDays ? ` (oldest ${t.oldestDays} day${t.oldestDays > 1 ? 's' : ''})` : ''}, ${t.today} due today${t.sample.length ? `. Missed: ${t.sample.join(', ')}` : ''}`));
  const teamText = teamLines.length ? `Team\n${teamLines.join('\n')}\n` : '';
  const teamHtml = teamLines.length ? `<h3 style="margin:14px 0 6px">Team</h3><ul>${teamLines.map((l) => `<li>${esc(l)}</li>`).join('')}</ul>` : '';
  return {
    empty, subject, team, count: kind === 'evening' ? today.length : items.length,
    text: `${parts.map((p) => p.text).join('')}${teamText}\n${site}/today`,
    html: wrap(kind === 'evening' ? 'Still not done today' : 'Your follow-ups', `${parts.map((p) => p.html).join('')}${teamHtml}<p><a href="${esc(site)}/today">Open Today</a></p>`),
  };
}

// Follow-ups that are past their time and still not done. stage 1 is the first alert, stage 2 the final one.
export function buildMissedEmail({ items, people, site, tz, stage, now }) {
  const nameOf = (id) => people.find((p) => p.id === id)?.full_name || 'Unassigned';
  const sorted = [...items].sort((a, b) => new Date(a.due_at) - new Date(b.due_at));
  const late = (a) => Math.max(0, Math.round((now - new Date(a.due_at)) / 60000));
  const lines = sorted.map((a) => {
    const t = aboutWhat(a, site);
    const note = [a.title, a.description].filter(Boolean).join(' · ');
    const lateText = late(a) >= 60 ? `${Math.floor(late(a) / 60)}h ${late(a) % 60}m late` : `${late(a)} min late`;
    return {
      text: `${fmtTime(a.due_at, tz)} ${nameOf(a.assigned_to)} (${lateText}) - ${t.name}${t.phone ? ' ' + t.phone : ''} - ${note}\n  ${t.href}`,
      html: `<li><strong>${esc(fmtTime(a.due_at, tz))}</strong> ${esc(nameOf(a.assigned_to))} <span style="color:#a3392b">(${esc(lateText)})</span> - <a href="${esc(t.href)}">${esc(t.name)}</a>${t.phone ? ' ' + esc(t.phone) : ''} - ${esc(note)}</li>`,
    };
  });
  const n = sorted.length;
  const title = stage === 2 ? `Still not done: ${n} missed follow-up${n === 1 ? '' : 's'}` : `${n} missed follow-up${n === 1 ? '' : 's'}`;
  return {
    empty: !n, subject: title, count: n,
    text: `${title}\n\n${lines.map((l) => l.text).join('\n')}\n\n${site}/today`,
    html: wrap(title, `<ul>${lines.map((l) => l.html).join('')}</ul><p><a href="${esc(site)}/today">Open Today</a></p>`),
  };
}

// Follow-ups that start within the next hour (from anyone).
export function buildHourEmail({ items, people, site, tz, lead }) {
  const nameOf = (id) => people.find((p) => p.id === id)?.full_name || 'Unassigned';
  const sorted = [...items].sort((a, b) => new Date(a.due_at) - new Date(b.due_at));
  const lines = sorted.map((a) => lineOf(a, site, tz, false, nameOf(a.assigned_to)));
  return {
    empty: !sorted.length,
    subject: `${sorted.length} follow-up${sorted.length === 1 ? '' : 's'} in the next ${lead} minutes`,
    text: `${lines.map((l) => l.text).join('\n')}\n\n${site}/today`,
    html: wrap(`Coming up in the next ${lead} minutes`, `<ul>${lines.map((l) => l.html).join('')}</ul><p><a href="${esc(site)}/today">Open Today</a></p>`),
  };
}
