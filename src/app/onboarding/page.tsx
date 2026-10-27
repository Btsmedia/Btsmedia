import { requireUser } from '@/lib/auth';
import { createWorkspace } from '../auth/actions';
import { Field } from '@/components/ui';
import { Submit } from '@/components/client';
import { env } from '@/lib/env';

export const metadata = { title: 'Set up your studio' };

export default async function Onboarding() {
  await requireUser('/onboarding');
  const domain = env.portalRootDomain ? `.${env.portalRootDomain}` : '';
  return (
    <div className="page-narrow" style={{ paddingBlock: '8vh' }}>
      <form className="card" action={createWorkspace} style={{ padding: 28, gap: 16 }}>
        <p className="eyebrow">Step 1 of 1</p>
        <h1>Name your studio</h1>
        <p className="muted small">Clients see this name on their portal, invoices and contracts. You can change it later.</p>
        <Field label="Studio name"><input className="inp" name="name" id="name" required placeholder="Onera Studio" /></Field>
        <Field label="Portal address" hint={domain ? `Clients sign in at <address>${domain}` : 'Lowercase letters, numbers and dashes. Used in your portal link.'}>
          <div className="row" style={{ gap: 6 }}>{!domain && <span className="muted small mono">/p/</span>}<input className="inp mono" name="slug" id="slug" placeholder="onera" pattern="[a-z0-9][a-z0-9-]{1,38}[a-z0-9]" />{domain && <span className="muted small mono">{domain}</span>}</div>
        </Field>
        <Submit className="btn primary lg block" pending="Setting up…">Create studio</Submit>
      </form>
    </div>
  );
}
