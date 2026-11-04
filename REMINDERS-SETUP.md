# Setting up email reminders (about 10 minutes)

The CRM sends these emails to ONE address (yours), covering everyone's follow-ups. Callers never get them:
1. **Before:** one batched email about an hour before follow-ups are due.
2. **Missed, first alert:** 15 minutes after the due time, if the follow-up is still not marked done.
3. **Missed, second alert:** 60 minutes after the due time, if it is still not done.
(Morning and evening summaries also exist but are switched off by default. Turn them on in Settings if you ever want them.)

1. **Supabase:** run `supabase/phase11a.sql` and then `supabase/phase12a.sql` once each in the SQL Editor.
2. **Resend (the sender):** sign up free at resend.com using the email address where you want the reminders.
   Open API Keys, create a key, and copy it. (Without your own domain, Resend can only send to the email you signed up with. That is fine here.)
3. **Vercel:** open your project, then Settings, then Environment Variables, and add two variables of type **Secret**:
   - `RESEND_API_KEY` with the key from Resend
   - `CRON_SECRET` with a long random text you make up (30 or more letters and digits). Keep a copy.
   `SUPABASE_SERVICE_ROLE_KEY` must also exist (you added it for the Team page). Then redeploy.
4. **CRM, Settings, Email reminders:** enter your email, choose the times, click Save, then **Send test email**. It should arrive within a minute.
   The "Setup check" line under it shows which of the three keys is missing.
5. **The timer (free):** at cron-job.org create an account and a new cronjob:
   - URL: `https://YOUR-SITE/api/cron/reminders` (the Settings page shows your exact address)
   - Schedule: every 5 minutes
   - Under Advanced, add a header named `Authorization` with the value `Bearer ` followed by your CRON_SECRET (keep the space after Bearer)
   - Use "Test run". A reply like `{"ok":true,"results":[]}` means it works.

Notes
- The delays (15 and 60 minutes, and how long before) can be changed in Settings. The second missed alert can be switched off.
- Missed alerts only look back 24 hours, so turning them on never sends a flood of old items.
- A follow-up is reminded once, about the chosen number of minutes before it is due. If several fall in the same window they come in one email.
- At most 80 emails a day are sent. The Settings page lists the last few sends, including any errors.
