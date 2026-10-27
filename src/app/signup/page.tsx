import Link from 'next/link';
import { signUp } from '../auth/actions';
import { Field } from '@/components/ui';
import { Submit } from '@/components/client';

export const metadata = { title: 'Create your studio' };

export default function Signup() {
  return (
    <div className="page-narrow" style={{ paddingBlock: '8vh' }}>
      <form className="card" action={signUp} style={{ padding: 28, gap: 16 }}>
        <div className="row"><span className="logo" style={{ boxShadow: 'none', background: 'var(--tint)' }}><span><b>O</b></span></span><div><b>Onera</b><p className="muted xs">14-day trial of Studio</p></div></div>
        <h1>Create your account</h1>
        <p className="muted small">Next you&apos;ll name your studio and pick its portal address.</p>
        <Field label="Your name"><input className="inp" name="name" id="name" required autoComplete="name" /></Field>
        <Field label="Work email"><input className="inp" name="email" id="email" type="email" required autoComplete="email" /></Field>
        <Field label="Password" hint="At least 8 characters"><input className="inp" name="password" id="password" type="password" minLength={8} required autoComplete="new-password" /></Field>
        <Submit className="btn primary lg block" pending="Creating account…">Create account</Submit>
        <p className="muted small" style={{ textAlign: 'center' }}>Already have an account? <Link href="/login">Sign in</Link></p>
      </form>
    </div>
  );
}
