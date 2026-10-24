import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient, getClient, getUser } from '../../lib/supabase/server';

export default async function AppLayout({ children }) {
  const supabase = getClient();
  const user = await getUser();
  if (!user) redirect('/login');
  const { data: profile } = await supabase
    .from('profiles').select('full_name, role').eq('id', user.id).single();

  async function signOut() {
    'use server';
    await createClient().auth.signOut();
    redirect('/login');
  }

  return (
    <>
      <header className="bar">
        <strong>Call CRM</strong>
        <nav>
          <Link href="/today">Today</Link>
          <Link href="/quick-add">Quick add</Link>
          <Link href="/persons">Persons</Link>
          <Link href="/organizations">Organizations</Link>
          <Link href="/deals">Deals</Link>
          <Link href="/import">Import</Link>
          <Link href="/settings">Settings</Link>
          {profile?.role === 'admin' && <Link href="/team">Team</Link>}
        </nav>
        <form action={signOut}>
          <span className="me">{profile?.full_name} ({profile?.role})</span>
          <button className="quiet" type="submit">Sign out</button>
        </form>
      </header>
      <main>{children}</main>
    </>
  );
}
