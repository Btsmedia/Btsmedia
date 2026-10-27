import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireMember } from '@/lib/auth';
import { Card, Crumbs, Hidden, Notice, PageHead } from '@/components/ui';
import { ConfirmSubmit, CopyButton, Submit } from '@/components/client';
import { ProposalDoc } from '@/components/ProposalDoc';
import { Icon } from '@/components/Icon';
import { ProposalEditor } from './editor';
import { proposalAction } from '../../more-actions';
import { portalUrl } from '@/lib/env';
import { when } from '@/lib/format';
import type { Contact, Proposal, ProposalItem } from '@/lib/types';

export default async function ProposalPage({ params, searchParams }: { params: Promise<{ ws: string; id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { ws: slug, id } = await params; const sp = await searchParams;
  const { supabase, ws } = await requireMember(slug);
  const { data } = await supabase.from('proposals').select('*, contacts(*), proposal_items(*)').eq('id', id).eq('workspace_id', ws.id).maybeSingle();
  if (!data) notFound();
  const q = data as Proposal & { contacts: Contact; proposal_items: ProposalItem[] };
  const items = [...q.proposal_items].sort((a, b) => (a.position || 0) - (b.position || 0));
  const b = `/s/${slug}`;
  const crumbs = <Crumbs items={[['Proposals', `${b}/proposals`], [q.number]]} />;
  if (q.status === 'draft') {
    const { data: templates } = await supabase.from('contract_templates').select('id, name').eq('workspace_id', ws.id).order('created_at');
    return (
      <div className="page">{crumbs}<PageHead eyebrow={`Draft · for ${q.contacts.name}`} title={q.title} />
        <ProposalEditor slug={slug} q={q} items={items} templates={templates || []} vatRate={Number(ws.vat_rate)} currency={ws.currency} />
        <form action={proposalAction} className="row"><Hidden v={{ ws: slug, id, op: 'delete' }} /><span className="sp" /><ConfirmSubmit className="btn ghost" confirm="Click again to delete this draft"><Icon name="trash" />Delete draft</ConfirmSubmit></form>
      </div>
    );
  }
  return (
    <div className="page">
      {crumbs}
      {sp.invite && <Notice tone="info" icon="link"><div className="col g8"><span>{q.contacts.name} hasn&apos;t joined the portal yet. Email isn&apos;t set up, so share this sign-in link:</span><span className="mono xs" style={{ wordBreak: 'break-all' }}>{sp.invite}</span><CopyButton text={sp.invite} label="Copy link" /></div></Notice>}
      <div className="split">
        <ProposalDoc ws={ws} q={q} items={items} contact={q.contacts} />
        <div className="stack side-sticky">
          <Card>
            {q.status === 'sent' && <Notice tone="info" icon="clock">Sent {when(q.sent_at)} by {q.sent_by_name}. Waiting for {q.contacts.name.split(' ')[0]}.</Notice>}
            {q.status === 'accepted' && <Notice tone="good" icon="check">Accepted by {q.accepted_name} {when(q.decided_at)}.</Notice>}
            {q.status === 'declined' && <Notice tone="warn" icon="x">Declined {when(q.decided_at)}.{q.decline_reason ? ` “${q.decline_reason}”` : ''}</Notice>}
            {q.status === 'accepted' && <div className="col g6">
              {q.project_id && <Link className="btn block" href={`${b}/projects/${q.project_id}`}><Icon name="folder" />Open project</Link>}
              {q.contract_id && <Link className="btn block" href={`${b}/contracts/${q.contract_id}`}><Icon name="sign" />Agreement</Link>}
              {q.invoice_id && <Link className="btn block" href={`${b}/invoices/${q.invoice_id}`}><Icon name="receipt" />Deposit invoice</Link>}
            </div>}
            <CopyButton text={portalUrl(slug, `/proposals/${id}`)} label="Client link" />
            {q.status === 'sent' && <>
              <form action={proposalAction}><Hidden v={{ ws: slug, id, op: 'remind' }} /><Submit className="btn block" pending="Sending…"><Icon name="bell" />Send a reminder</Submit></form>
              <form action={proposalAction}><Hidden v={{ ws: slug, id, op: 'withdraw' }} /><ConfirmSubmit className="btn ghost block" confirm="Withdraw and edit?"><Icon name="edit" />Withdraw to edit</ConfirmSubmit></form>
            </>}
            <form action={proposalAction}><Hidden v={{ ws: slug, id, op: 'duplicate' }} /><Submit className="btn block" pending="Copying…"><Icon name="copy" />Duplicate</Submit></form>
            {q.status === 'declined' && <form action={proposalAction}><Hidden v={{ ws: slug, id, op: 'delete' }} /><ConfirmSubmit className="btn ghost block" confirm="Delete for good?"><Icon name="trash" />Delete</ConfirmSubmit></form>}
          </Card>
          <Link className="link small" href={`${b}/contacts/${q.contact_id}`}>{q.contacts.name}{q.contacts.company ? ` · ${q.contacts.company}` : ''}</Link>
        </div>
      </div>
    </div>
  );
}
