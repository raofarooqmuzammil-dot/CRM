'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createClient } from '../../lib/supabase/server';
import { createAdminClient } from '../../lib/supabase/admin';
import { sendEmail } from '../../lib/mailer';
import { DEFAULTS } from '../../lib/reminders';

async function requireAdmin() {
  const s = createClient();
  const { data: { user } } = await s.auth.getUser();
  const { data: me } = await s.from('profiles').select('role').eq('id', user.id).single();
  if (me?.role !== 'admin') throw new Error('Admins only');
  return { s, user };
}
const time = (v, fallback) => (/^\d{2}:\d{2}$/.test(String(v)) ? String(v) : fallback);

export async function saveReminders(fd) {
  const { s, user } = await requireAdmin();
  const email = String(fd.get('email') || '').trim();
  if (email && !email.includes('@')) throw new Error('That does not look like an email address');
  const lead = [15, 30, 60, 120].includes(Number(fd.get('lead'))) ? Number(fd.get('lead')) : 60;
  const missed1 = [15, 30, 60].includes(Number(fd.get('missed1'))) ? Number(fd.get('missed1')) : 15;
  const missed2 = [0, 30, 60, 120].includes(Number(fd.get('missed2'))) ? Number(fd.get('missed2')) : 60;
  const { error } = await s.from('app_settings').upsert({ key: 'reminders', value: {
    morning: fd.get('morning') === 'on', evening: fd.get('evening') === 'on', hour: fd.get('hour') === 'on',
    morning_time: time(fd.get('morning_time'), DEFAULTS.morning_time), evening_time: time(fd.get('evening_time'), DEFAULTS.evening_time),
    missed: fd.get('missed') === 'on', missed1, missed2: missed2 > missed1 ? missed2 : 0,
    lead, email, user_id: user.id, cap: DEFAULTS.cap,
  } });
  if (error) throw new Error(error.message);
  revalidatePath('/settings');
}

// Sends a sample email so you can check the setup. The result is shown on the Settings page.
export async function sendTestEmail() {
  const { s } = await requireAdmin();
  const { data } = await s.from('app_settings').select('value').eq('key', 'reminders').maybeSingle();
  const to = data?.value?.email || process.env.REMINDER_EMAIL || '';
  const r = await sendEmail({
    to, subject: 'Test reminder from your CRM',
    text: 'This is a test. If you can read it, your reminder emails are set up correctly.',
    html: '<p>This is a test. If you can read it, your reminder emails are set up correctly.</p>',
  });
  redirect(r.ok ? '/settings?test=sent' : `/settings?test=failed&msg=${encodeURIComponent(r.error || 'unknown error')}`);
}
