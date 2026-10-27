import { requirePortal } from '@/lib/auth';
import { Card, Field, Hidden, PageHead } from '@/components/ui';
import { Submit } from '@/components/client';
import { clientPassword, clientProfile, portalSignOut } from '../../actions';

export const metadata = { title: 'Account' };

export default async function PortalAccount({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { ws, contact, user } = await requirePortal(slug);
  return (
    <div className="page page-narrow">
      <PageHead eyebrow={ws.name} title="Your account" />
      <Card title="Profile" icon="user">
        <form action={clientProfile} className="col g12"><Hidden v={{ slug }} />
          <div className="fields">
            <Field label="Name"><input className="inp" name="name" id="pa-name" defaultValue={contact.name} required autoComplete="name" /></Field>
            <Field label="Company" optional><input className="inp" name="company" id="pa-company" defaultValue={contact.company || ''} autoComplete="organization" /></Field>
            <Field label="Phone" optional><input className="inp" name="phone" id="pa-phone" defaultValue={contact.phone || ''} autoComplete="tel" /></Field>
            <Field label="Email" hint={`To change it, ask ${ws.name}.`}><input className="inp" value={user.email || contact.email || ''} readOnly disabled /></Field>
          </div>
          <div className="row"><span className="sp" /><Submit pending="Saving…">Save profile</Submit></div>
        </form>
      </Card>
      <Card title="Password" icon="lock">
        <form action={clientPassword} className="col g12"><Hidden v={{ slug }} />
          <p className="muted small">You can always sign in with an emailed link. Set a password if you&apos;d rather type one.</p>
          <Field label="New password" hint="At least 8 characters"><input className="inp" type="password" name="password" id="pa-pw" minLength={8} required autoComplete="new-password" /></Field>
          <div className="row"><span className="sp" /><Submit pending="Saving…">Set password</Submit></div>
        </form>
      </Card>
      <form action={portalSignOut}><Hidden v={{ slug }} /><button className="btn">Sign out</button></form>
    </div>
  );
}
