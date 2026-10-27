import Link from 'next/link';
import { signIn } from '../auth/actions';
import { Field, Notice } from '@/components/ui';
import { Submit } from '@/components/client';
import { Icon } from '@/components/Icon';

export const metadata = { title: 'Sign in' };

export default async function Login({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams; const next = sp.next || '/app';
  return (
    <div className="page-narrow" style={{ paddingBlock: '8vh' }}>
      <form className="card" action={signIn} style={{ padding: 28, gap: 16 }}>
        <div className="row"><span className="logo" style={{ boxShadow: 'none', background: 'var(--tint)' }}><span><b>O</b></span></span><div><b>Onera</b><p className="muted xs">Studio sign in</p></div></div>
        <h1>Sign in</h1>
        {sp.sent ? <Notice tone="good" icon="mail">We sent a sign-in link to <b>{sp.email}</b>. It works for one hour.</Notice> : null}
        <input type="hidden" name="next" value={next} /><input type="hidden" name="from" value="/login" />
        <Field label="Email"><input className="inp" name="email" id="email" type="email" required defaultValue={sp.email} autoComplete="email" /></Field>
        <Field label="Password" hint="Leave empty to get a sign-in link instead"><input className="inp" name="password" id="password" type="password" autoComplete="current-password" /></Field>
        <Submit className="btn primary lg block" pending="Signing in…">Sign in</Submit>
        <button className="btn lg block" name="mode" value="link" type="submit"><Icon name="mail" />Email me a sign-in link</button>
        <p className="muted small" style={{ textAlign: 'center' }}>New to Onera? <Link href="/signup">Create your studio</Link></p>
      </form>
    </div>
  );
}
