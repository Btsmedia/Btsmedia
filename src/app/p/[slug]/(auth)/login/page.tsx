import { notFound } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase/admin';
import { getUser } from '@/lib/auth';
import { portalSignIn, portalSignOut } from '../../actions';
import { Field, Notice } from '@/components/ui';
import { Submit } from '@/components/client';
import { Icon } from '@/components/Icon';
import { StudioMark } from '@/components/docs';

export const metadata = { title: 'Client portal' };

export default async function PortalLogin({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { slug } = await params; const sp = await searchParams;
  // Branding is public: name, colour and welcome text only
  const { data: ws } = await createAdminClient().from('workspaces').select('name, brand_color, portal_welcome, logo_path').eq('slug', slug).maybeSingle();
  if (!ws) notFound();
  const { user } = await getUser();
  return (
    <div className="auth">
      <div className="art" style={{ background: `linear-gradient(160deg, ${ws.brand_color}cc, ${ws.brand_color})` }}>
        <p className="eyebrow" style={{ color: 'rgba(255,255,255,.8)' }}>{ws.name} · client portal</p>
        <h2 style={{ marginTop: 10 }}>Your project, invoices and files in one place.</h2>
        <p style={{ opacity: 0.85, marginTop: 10, maxWidth: '40ch' }}>{ws.portal_welcome}</p>
      </div>
      <div className="panel">
        <form className="card col g16" action={portalSignIn}>
          <input type="hidden" name="slug" value={slug} />
          <div className="row" style={{ gap: 12 }}><StudioMark ws={ws} /><div><b>{ws.name}</b><p className="muted xs">Client portal</p></div></div>
          <div className="col g6"><h2>Sign in</h2><p className="muted small">Use the email {ws.name} has on file for you.</p></div>
          {sp.err === 'noaccess' && <Notice tone="warn" icon="alert">You&apos;re signed in as {user?.email}, but {ws.name} hasn&apos;t invited that email to its portal. Sign in with the email they used, or ask them to invite you.</Notice>}
          {sp.sent && <Notice tone="good" icon="mail">If {sp.email} has access, a sign-in link is on its way. It works for one hour.</Notice>}
          <Field label="Email"><input className="inp" type="email" name="email" id="pl-email" required defaultValue={sp.email} autoComplete="email" /></Field>
          <Field label="Password" hint="Leave empty to get a sign-in link by email"><input className="inp" type="password" name="password" id="pl-pw" autoComplete="current-password" /></Field>
          <Submit className="btn primary lg block" pending="Signing in…"><Icon name="mail" />Continue</Submit>
          {user && sp.err === 'noaccess' && <button className="btn block" formAction={portalSignOut}>Sign out of {user.email}</button>}
        </form>
      </div>
    </div>
  );
}
