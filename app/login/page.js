import { redirect } from 'next/navigation';
import { createClient } from '../../lib/supabase/server';

export default function Login({ searchParams }) {
  async function signIn(formData) {
    'use server';
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({
      email: formData.get('email'),
      password: formData.get('password'),
    });
    if (error) redirect('/login?error=' + encodeURIComponent(error.message));
    redirect('/persons');
  }

  return (
    <div className="login">
      <h1>Sign in to Call CRM</h1>
      {searchParams?.error && <p className="error">{searchParams.error}</p>}
      <form action={signIn}>
        <label>Email<input name="email" type="email" required autoFocus /></label>
        <label>Password<input name="password" type="password" required /></label>
        <button type="submit">Sign in</button>
      </form>
    </div>
  );
}
