'use server';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { env } from '@/lib/env';
import { back } from '@/lib/auth';
import { slugify } from '@/lib/format';

const safeNext = (n: FormDataEntryValue | null, fallback = '/app') => {
  const s = String(n || ''); return s.startsWith('/') && !s.startsWith('//') ? s : fallback;
};

export async function signIn(fd: FormData) {
  const sb = await createClient();
  const email = String(fd.get('email') || '').trim(), password = String(fd.get('password') || '');
  const next = safeNext(fd.get('next')), from = String(fd.get('from') || '/login');
  if (!email) back(`${from}?next=${encodeURIComponent(next)}`, undefined, 'Enter your email address');
  if (fd.get('mode') === 'link' || !password) {
    const { error } = await sb.auth.signInWithOtp({ email, options: { shouldCreateUser: false, emailRedirectTo: `${env.appUrl}/auth/callback?next=${encodeURIComponent(next)}` } });
    if (error) back(`${from}?next=${encodeURIComponent(next)}`, undefined, error.message.includes('Signups not allowed') ? 'There is no account for that email yet.' : error.message);
    back(`${from}?sent=1&email=${encodeURIComponent(email)}&next=${encodeURIComponent(next)}`);
  }
  const { error } = await sb.auth.signInWithPassword({ email, password });
  if (error) back(`${from}?next=${encodeURIComponent(next)}&email=${encodeURIComponent(email)}`, undefined, 'That email and password don\'t match. Try again or use a sign-in link.');
  redirect(next);
}

export async function signUp(fd: FormData) {
  const sb = await createClient();
  const name = String(fd.get('name') || '').trim(), email = String(fd.get('email') || '').trim(), password = String(fd.get('password') || '');
  if (name.length < 2) back('/signup', undefined, 'Enter your name');
  if (password.length < 8) back('/signup', undefined, 'Use a password of at least 8 characters');
  const { data, error } = await sb.auth.signUp({ email, password, options: { data: { full_name: name }, emailRedirectTo: `${env.appUrl}/auth/callback?next=/onboarding` } });
  if (error) back('/signup', undefined, error.message);
  if (!data.session) back(`/login?sent=1&email=${encodeURIComponent(email)}&next=/onboarding`);
  redirect('/onboarding');
}

export async function signOut() {
  const sb = await createClient();
  await sb.auth.signOut();
  redirect('/login');
}

export async function createWorkspace(fd: FormData) {
  const sb = await createClient();
  const name = String(fd.get('name') || '').trim();
  const slug = slugify(String(fd.get('slug') || '') || name);
  if (name.length < 2) back('/onboarding', undefined, 'Give your studio a name');
  if (slug.length < 3) back('/onboarding', undefined, 'The portal address needs at least 3 letters or numbers');
  const { data, error } = await sb.rpc('create_workspace', { p_name: name, p_slug: slug });
  if (error) back('/onboarding', undefined, error.code === '23505' ? `${slug} is taken. Try another portal address.` : error.message);
  redirect(`/s/${(data as { slug: string }).slug}/settings?welcome=1`);
}

export async function acceptInvite(fd: FormData) {
  const sb = await createClient();
  const token = String(fd.get('token'));
  const { data, error } = await sb.rpc('accept_workspace_invite', { p_token: token });
  if (error) back(`/invite/${token}`, undefined, error.message);
  redirect(`/s/${data}?ok=${encodeURIComponent('You joined the team')}`);
}
