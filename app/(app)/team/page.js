import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createClient } from '../../../lib/supabase/server';
import { createAdminClient } from '../../../lib/supabase/admin';
import { removeAccess, restoreAccess } from '../../actions/team';

async function requireAdmin() {
  const s = createClient();
  const { data: { user } } = await s.auth.getUser();
  const { data: me } = await s.from('profiles').select('role').eq('id', user.id).single();
  if (me?.role !== 'admin') throw new Error('Admins only');
  return { s, user };
}

export default async function Team() {
  const { s, user } = await requireAdmin().catch(() => redirect('/today'));
  const hasKey = Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY);
  const { data: profiles } = await s.from('profiles').select('id, full_name, role, disabled').order('created_at');

  const emails = new Map();
  if (hasKey) {
    const { data } = await createAdminClient().auth.admin.listUsers({ perPage: 200 });
    data?.users?.forEach((u) => emails.set(u.id, u.email));
  }

  async function addUser(fd) {
    'use server';
    await requireAdmin();
    const admin = createAdminClient();
    const { data, error } = await admin.auth.admin.createUser({
      email: String(fd.get('email')).trim(),
      password: String(fd.get('password')),
      email_confirm: true,
      user_metadata: { full_name: String(fd.get('full_name')).trim() },
    });
    if (error) throw new Error(error.message);
    if (fd.get('role') === 'admin') await admin.from('profiles').update({ role: 'admin' }).eq('id', data.user.id);
    revalidatePath('/team');
  }
  async function saveUser(fd) {
    'use server';
    const { s, user } = await requireAdmin();
    const row = { full_name: String(fd.get('full_name')).trim() };
    const role = fd.get('role');
    if (role && fd.get('id') !== user.id) row.role = role;
    const { error } = await s.from('profiles').update(row).eq('id', fd.get('id'));
    if (error) throw new Error(error.message);
    revalidatePath('/team');
  }
  async function resetPassword(fd) {
    'use server';
    await requireAdmin();
    const { error } = await createAdminClient().auth.admin
      .updateUserById(fd.get('id'), { password: String(fd.get('password')) });
    if (error) throw new Error(error.message);
  }

  return (
    <>
      <h1>Team</h1>
      {!hasKey && (
        <section className="panel">
          <h2>One setup step needed to add users here</h2>
          <p>In Supabase open Project Settings, then API, and copy the <strong>service_role</strong> key. In Vercel add an environment variable named <code>SUPABASE_SERVICE_ROLE_KEY</code> with that value, set the type to <strong>Secret</strong>, and redeploy. Never use <code>NEXT_PUBLIC_</code> in its name, because this key bypasses all privacy rules.</p>
        </section>
      )}
      {hasKey && (
        <section className="panel">
          <h2>Add a person to the team</h2>
          <form className="grid" action={addUser}>
            <label>Name<input name="full_name" required /></label>
            <label>Email<input name="email" type="email" required /></label>
            <label>Password (at least 6 characters)<input name="password" type="text" minLength={6} required /></label>
            <label>Role
              <select name="role"><option value="caller">Caller</option><option value="admin">Admin</option></select>
            </label>
            <button type="submit">Add user</button>
          </form>
        </section>
      )}
      <section className="panel">
        <h2>Users ({profiles?.length || 0})</h2>
        {profiles?.map((p) => (
          <div key={p.id} className="user">
            <form className="row-form" action={saveUser}>
              <input type="hidden" name="id" value={p.id} />
              <span className="muted who">{emails.get(p.id) || ''}</span>
              <input name="full_name" defaultValue={p.full_name} aria-label="Name" required />
              {p.id === user.id
                ? <span className="tag">{p.role} (you)</span>
                : <select name="role" defaultValue={p.role} aria-label="Role"><option value="caller">Caller</option><option value="admin">Admin</option></select>}
              <button type="submit">Save</button>
            </form>
            {hasKey && (
              <details><summary>Reset password</summary>
                <form className="row-form" action={resetPassword}>
                  <input type="hidden" name="id" value={p.id} />
                  <input name="password" type="text" minLength={6} placeholder="New password" required />
                  <button type="submit" className="ghost">Set password</button>
                </form>
              </details>
            )}
            {hasKey && p.id !== user.id && (p.disabled ? (
              <form className="row-form" action={restoreAccess}>
                <input type="hidden" name="id" value={p.id} />
                <span className="tag warn">Access removed</span>
                <button type="submit" className="ghost">Restore access</button>
              </form>
            ) : (
              <details><summary>Remove access</summary>
                <form className="row-form" action={removeAccess}>
                  <input type="hidden" name="id" value={p.id} />
                  <label>Give their records and open follow-ups to
                    <select name="heir" defaultValue=""><option value="">No owner</option>
                      {profiles.filter((x) => x.id !== p.id && !x.disabled).map((x) => <option key={x.id} value={x.id}>{x.full_name}</option>)}</select>
                  </label>
                  <label className="check"><input type="checkbox" name="confirm" required /> I understand they can no longer log in</label>
                  <button type="submit" className="ghost danger">Remove access</button>
                </form>
              </details>
            ))}
            {p.disabled && !hasKey && <span className="tag warn">Access removed</span>}
          </div>
        ))}
      </section>
    </>
  );
}
