// Sends one email through Resend (resend.com). `fetchFn` can be replaced in tests.
export async function sendEmail({ to, subject, html, text }, { fetchFn = fetch, env = process.env } = {}) {
  if (!env.RESEND_API_KEY) return { ok: false, error: 'RESEND_API_KEY is not set in Vercel' };
  if (!to) return { ok: false, error: 'No email address to send to' };
  try {
    const res = await fetchFn('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: env.REMINDER_FROM || 'CRM Reminders <onboarding@resend.dev>', to: [to], subject, html, text }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: body.message || `Resend answered ${res.status}` };
    return { ok: true, id: body.id };
  } catch (e) {
    return { ok: false, error: e.message || 'Could not reach Resend' };
  }
}
