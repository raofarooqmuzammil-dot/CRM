import { startOfToday } from './zones';
import { buildDigest, buildHourEmail, buildMissedEmail } from './reminderEmail';

export const DEFAULTS = { morning: false, evening: false, hour: true, missed: true, missed1: 15, missed2: 60, morning_time: '08:00', evening_time: '18:00', lead: 60, email: '', user_id: null, cap: 80 };
const SELECT = 'id, title, type, due_at, description, assigned_to, org:organizations(id, name, phone), person:persons(id, name, phone), deal:deals(id, title)';

const ymd = (d, tz) => new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
const minutesOf = (d, tz) => {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(d).map((x) => [x.type, x.value]));
  return Number(p.hour) * 60 + Number(p.minute);
};
const toMinutes = (hhmm) => { const [h, m] = String(hhmm || '').split(':').map(Number); return (h || 0) * 60 + (m || 0); };

export async function loadConfig(s) {
  const { data } = await s.from('app_settings').select('key, value').in('key', ['reminders', 'team_timezone']);
  const by = Object.fromEntries((data || []).map((r) => [r.key, r.value]));
  return { cfg: { ...DEFAULTS, ...(by.reminders || {}) }, tz: by.team_timezone?.zone || 'UTC' };
}

// One tick, called every few minutes by an outside timer. Decides which emails are due and sends them.
export async function runReminders({ s, now = new Date(), site, send, env = process.env }) {
  const { cfg, tz } = await loadConfig(s);
  const email = cfg.email || env.REMINDER_EMAIL || '';
  if (!email) return { skipped: 'No reminder email address is set' };
  const today = ymd(now, tz);
  const { data: logs } = await s.from('reminder_log').select('kind, emailed').eq('sent_on', today);
  const done = new Set((logs || []).filter((l) => l.kind === 'morning' || l.kind === 'evening').map((l) => l.kind));
  let emailedToday = (logs || []).filter((l) => l.emailed).length;
  const mins = minutesOf(now, tz), morningAt = toMinutes(cfg.morning_time), eveningAt = toMinutes(cfg.evening_time);
  const { data: people } = await s.from('profiles').select('id, full_name');
  const start = startOfToday(tz, now), end = startOfToday(tz, new Date(start.getTime() + 36 * 3600000));
  const results = [];

  const deliver = async (kind, mail, count, after) => {
    if (emailedToday >= cfg.cap) { results.push({ kind, skipped: 'daily email limit reached' }); return; }
    const r = await send({ to: email, subject: mail.subject, html: mail.html, text: mail.text });
    if (!r.ok) { results.push({ kind, error: r.error }); await s.from('reminder_log').insert({ kind, sent_on: today, emailed: false, items: 0, error: r.error }); return; }
    emailedToday += 1;
    await s.from('reminder_log').insert({ kind, sent_on: today, emailed: true, items: count });
    if (after) await after();
    results.push({ kind, sent: count });
  };

  for (const kind of ['morning', 'evening']) {
    const due = cfg[kind] && !done.has(kind) && (kind === 'morning' ? mins >= morningAt && mins < eveningAt : mins >= eveningAt);
    if (!due) continue;
    const { data: items } = await s.from('activities').select(SELECT).eq('done', false).lt('due_at', end.toISOString()).order('due_at').limit(1000);
    const mail = buildDigest({ kind, items: items || [], people: people || [], mineId: cfg.user_id, site, tz, start, end });
    if (mail.empty) { await s.from('reminder_log').insert({ kind, sent_on: today, emailed: false, items: 0 }); results.push({ kind, skipped: 'nothing to report' }); continue; }
    await deliver(kind, mail, mail.count);
  }

  if (cfg.hour) {
    const until = new Date(now.getTime() + Number(cfg.lead || 60) * 60000);
    const { data: soon } = await s.from('activities').select(SELECT).eq('done', false).is('reminded_at', null)
      .gt('due_at', now.toISOString()).lte('due_at', until.toISOString()).order('due_at').limit(200);
    if (soon?.length) {
      const mail = buildHourEmail({ items: soon, people: people || [], site, tz, lead: Number(cfg.lead || 60) });
      await deliver('hour', mail, soon.length, async () => { await s.from('activities').update({ reminded_at: now.toISOString() }).in('id', soon.map((a) => a.id)); });
    }
  }

  // Missed alerts: still not done after the due time. The final alert is handled first so a late timer sends one email, not two.
  if (cfg.missed) {
    const lookback = new Date(now.getTime() - 24 * 3600000).toISOString();
    const stages = [[2, Number(cfg.missed2) || 0], [1, Number(cfg.missed1) || 0]].filter(([, m]) => m > 0);
    for (const [stage, minutes] of stages) {
      const cutoff = new Date(now.getTime() - minutes * 60000).toISOString();
      let q = s.from('activities').select(SELECT).eq('done', false).lte('due_at', cutoff).gt('due_at', lookback);
      q = stage === 2 ? q.is('missed2_notified_at', null) : q.is('missed_notified_at', null);
      if (stage === 1 && stages.some(([st]) => st === 2)) q = q.gt('due_at', new Date(now.getTime() - Number(cfg.missed2) * 60000).toISOString());
      const { data: late } = await q.order('due_at').limit(200);
      if (!late?.length) continue;
      const mail = buildMissedEmail({ items: late, people: people || [], site, tz, stage, now: now.getTime() });
      await deliver('missed' + stage, mail, late.length, async () => {
        await s.from('activities').update(stage === 2 ? { missed_notified_at: now.toISOString(), missed2_notified_at: now.toISOString() } : { missed_notified_at: now.toISOString() }).in('id', late.map((a) => a.id));
      });
    }
  }
  return { ok: true, results };
}
