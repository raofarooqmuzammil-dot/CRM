import { NextResponse } from 'next/server';
import { createAdminClient } from '../../../../lib/supabase/admin';
import { runReminders } from '../../../../lib/reminders';
import { sendEmail } from '../../../../lib/mailer';

export const dynamic = 'force-dynamic';

// Called every 5 minutes by an outside timer. Protected by CRON_SECRET (sent as a Bearer header, or as ?key=).
export async function GET(request) {
  const secret = process.env.CRON_SECRET;
  const url = new URL(request.url);
  const given = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') || url.searchParams.get('key');
  if (!secret || given !== secret) return NextResponse.json({ error: 'Not allowed' }, { status: 401 });
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return NextResponse.json({ error: 'SUPABASE_SERVICE_ROLE_KEY is not set' }, { status: 500 });
  try {
    const out = await runReminders({ s: createAdminClient(), site: process.env.SITE_URL || url.origin, send: (m) => sendEmail(m) });
    return NextResponse.json(out);
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
