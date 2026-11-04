import NavLinks from '../../components/NavLinks';
import { redirect } from 'next/navigation';
import { createClient, getClient, getUser } from '../../lib/supabase/server';

export default async function AppLayout({ children }) {
  const supabase = getClient();
  const user = await getUser();
  if (!user) redirect('/login');
  const { data: profile } = await supabase
    .from('profiles').select('full_name, role').eq('id', user.id).single();

  const links = [
    ['/today', 'Today'], ['/quick-add', 'Quick add'], ['/persons', 'Persons'], ['/organizations', 'Organizations'],
    ['/results', 'Results'], ['/dashboard', 'Dashboard'], ['/deals', 'Deals'], ['/import', 'Import'], ['/settings', 'Settings'],
    ...(profile?.role === 'admin' ? [['/team', 'Team']] : []),
  ];

  async function signOut() {
    'use server';
    await createClient().auth.signOut();
    redirect('/login');
  }

  return (
    <>
      <header className="bar">
        <strong>Call CRM</strong>
        <NavLinks links={links} />
        <form action={signOut}>
          <span className="me">{profile?.full_name} ({profile?.role})</span>
          <button className="quiet" type="submit">Sign out</button>
        </form>
      </header>
      <main>{children}</main>
    </>
  );
}
