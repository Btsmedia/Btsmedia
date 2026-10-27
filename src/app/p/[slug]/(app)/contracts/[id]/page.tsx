import { notFound } from 'next/navigation';
import { requirePortal } from '@/lib/auth';
import { Card, Crumbs, Field, Hidden, Notice } from '@/components/ui';
import { Submit } from '@/components/client';
import { ContractDoc } from '@/components/docs';
import { SignPad } from '@/components/SignPad';
import { Icon } from '@/components/Icon';
import { clientRequestChanges, clientSign } from '../../../actions';
import { dateY, when } from '@/lib/format';
import type { Contract } from '@/lib/types';

export default async function PortalContract({ params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params;
  const { supabase, ws, contact } = await requirePortal(slug);
  const { data } = await supabase.from('contracts').select('*').eq('id', id).eq('contact_id', contact.id).neq('status', 'draft').maybeSingle();
  if (!data) notFound();
  const k = data as Contract;
  const b = `/p/${slug}`;
  return (
    <div className="page">
      <Crumbs items={[['Contracts', `${b}/contracts`], [k.number]]} />
      <div className="split">
        <ContractDoc ws={ws} k={k} contact={contact} forClient />
        <div className="stack side-sticky">
          {k.status === 'sent' && <>
            <Card title="Sign this agreement" icon="sign">
              <p className="muted small">{k.studio_signer_name ? `${k.studio_signer_name} signed for ${ws.name}${k.studio_signed_at ? ` on ${dateY(k.studio_signed_at)}` : ''}. ` : ''}Read it through, then sign below. We record your name, the time, your IP address and a fingerprint of the document.</p>
              <SignPad action={clientSign} hidden={{ slug, id }} defaultName={contact.name} />
            </Card>
            <Card title="Something to change?" icon="edit">
              <form action={clientRequestChanges} className="col g8"><Hidden v={{ slug, id }} />
                <Field label="What should change" hint={`${ws.name} gets your note and sends an updated version.`}><textarea className="inp ta" name="reason" id="kr-reason" rows={3} required placeholder="e.g. Could the second payment be due on delivery?" /></Field>
                <Submit className="btn block" pending="Sending…">Request changes</Submit>
              </form>
            </Card>
          </>}
          {k.status === 'changes' && <Card><Notice tone="info" icon="edit"><div className="col g6"><b>You asked for changes</b><span style={{ whiteSpace: 'pre-line' }}>{k.change_request}</span><span className="muted xs">{ws.name} will send an updated version to sign.</span></div></Notice></Card>}
          {k.status === 'signed' && <Card>
            <Notice tone="good" icon="check">Signed by both sides{k.client_signed_at ? ` · ${when(k.client_signed_at)}` : ''}.</Notice>
            <a className="btn primary block" href={`/api/contracts/${id}/pdf`}><Icon name="download" />Download signed PDF</a>
          </Card>}
          {k.status === 'void' && <Card><Notice tone="plain" icon="x">{ws.name} withdrew this agreement. Nothing to sign.</Notice></Card>}
          {k.status !== 'signed' && <a className="btn block" href={`/api/contracts/${id}/pdf`}><Icon name="download" />Download PDF</a>}
        </div>
      </div>
    </div>
  );
}
