import { notFound } from 'next/navigation';
import { requireMember } from '@/lib/auth';
import { Card, Crumbs, Field, Hidden, Notice, PageHead } from '@/components/ui';
import { ConfirmSubmit, CopyButton, Submit } from '@/components/client';
import { ContractDoc } from '@/components/docs';
import { SectionsEditor } from '@/components/SectionsEditor';
import { Icon } from '@/components/Icon';
import { contractAction, saveContract } from '../../actions';
import { portalUrl } from '@/lib/env';
import { date, when } from '@/lib/format';
import type { Activity, Contact, Contract } from '@/lib/types';

export default async function ContractPage({ params, searchParams }: { params: Promise<{ ws: string; id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { ws: slug, id } = await params; const sp = await searchParams;
  const { supabase, ws, name } = await requireMember(slug);
  const { data } = await supabase.from('contracts').select('*, contacts(*)').eq('id', id).eq('workspace_id', ws.id).maybeSingle();
  if (!data) notFound();
  const k = data as Contract & { contacts: Contact }; const c = k.contacts;
  const { data: activity } = await supabase.from('activity').select('*').eq('entity_id', id).order('created_at', { ascending: false });
  const b = `/s/${slug}`;
  const h = { ws: slug, id };
  const crumbs = <Crumbs items={[['Contracts', `${b}/contracts`], [k.number]]} />;
  const invite = sp.invite && <Notice tone="info" icon="link"><div className="col g8"><span>{c.name} hasn&apos;t joined the portal yet. Share this one-time link so they can sign:</span><span className="mono xs" style={{ wordBreak: 'break-all' }}>{sp.invite}</span><CopyButton text={sp.invite} label="Copy link" /></div></Notice>;

  if (k.status === 'draft') return (
    <div className="page">{crumbs}<PageHead eyebrow={`Draft · ${c.name}`} title={k.title} />
      <div className="split">
        <form className="card" action={saveContract}>
          <Hidden v={h} />
          <Field label="Title"><input className="inp" name="title" id="ck-title" defaultValue={k.title} /></Field>
          <p className="muted xs">Client and project details were filled in from the template. Edit anything before sending.</p>
          <SectionsEditor name="body" initial={k.body} />
          <div className="row"><span className="sp" /><Submit pending="Saving…">Save draft</Submit></div>
        </form>
        <div className="stack side-sticky">
          <Card title="Sign and send" icon="send">
            {k.studio_signed_at ? <Notice tone="good" icon="check">Signed by {k.studio_signer_name} on {date(k.studio_signed_at)}</Notice> :
              <form action={contractAction} className="col g8"><Hidden v={{ ...h, op: 'studio-sign' }} /><Field label="Sign as"><input className="inp" name="signer" id="ck-signer" defaultValue={name} /></Field><p className="muted xs">Saving edits afterwards clears your signature so the client always signs what you signed.</p><Submit className="btn block" pending="Signing…"><Icon name="sign" />Sign for {ws.name}</Submit></form>}
            <form action={contractAction}><Hidden v={{ ...h, op: 'send' }} /><Submit className="btn primary lg block" pending="Sending…" disabled={!k.studio_signed_at}><Icon name="send" />Send to {c.name.split(' ')[0]}</Submit></form>
            {!c.email && <Notice tone="warn" icon="alert">Add an email to {c.name} before sending.</Notice>}
          </Card>
          <form action={contractAction} className="row"><Hidden v={{ ...h, op: 'delete' }} /><span className="sp" /><ConfirmSubmit className="btn ghost" confirm="Click again to delete"><Icon name="trash" />Delete draft</ConfirmSubmit></form>
        </div>
      </div>
    </div>
  );

  return (
    <div className="page">{crumbs}{invite}
      <div className="split">
        <ContractDoc ws={ws} k={k} contact={c} />
        <div className="stack side-sticky">
          <Card>
            {k.status === 'sent' && <Notice tone="warn" icon="clock">Waiting for {c.name}. Sent {date(k.sent_at)}.</Notice>}
            {k.status === 'changes' && <Notice tone="info" icon="chat">{c.name.split(' ')[0]} asked: “{k.change_request}”</Notice>}
            {k.status === 'signed' && <Notice tone="good" icon="check">Signed by both parties on {date(k.client_signed_at)}</Notice>}
            {k.status === 'void' && <Notice tone="plain" icon="x">Void</Notice>}
            {k.status === 'sent' && <form action={contractAction}><Hidden v={{ ...h, op: 'remind' }} /><Submit className="btn block" pending="Sending…"><Icon name="bell" />Send reminder</Submit></form>}
            {k.status === 'changes' && <form action={contractAction}><Hidden v={{ ...h, op: 'revise' }} /><Submit className="btn primary block" pending="…"><Icon name="edit" />Revise and resend</Submit></form>}
            <div className="row"><a className="btn block" href={`/api/contracts/${id}/pdf`}><Icon name="download" />PDF</a><CopyButton text={portalUrl(slug, `/contracts/${id}`)} label="Client link" /></div>
            {['sent', 'changes'].includes(k.status) && <form action={contractAction}><Hidden v={{ ...h, op: 'void' }} /><ConfirmSubmit className="btn ghost block" confirm="Void it?">Void contract</ConfirmSubmit></form>}
          </Card>
          <Card title="Audit trail" icon="clock">
            <div className="timeline">
              {k.client_signed_at && <div className="tl"><i /><div>{k.client_signer_name} signed ({k.client_signature_kind}){k.client_ip ? ` from ${k.client_ip}` : ''}<small>{when(k.client_signed_at)}</small></div></div>}
              {((activity || []) as Activity[]).filter((a) => a.kind !== 'contract.signed').map((a) => <div key={a.id} className="tl muted"><i /><div><b style={{ fontWeight: 500 }}>{a.actor_name}</b> {a.message}<small>{when(a.created_at)}</small></div></div>)}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
