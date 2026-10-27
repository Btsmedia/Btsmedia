import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requirePortal } from '@/lib/auth';
import { Card, Crumbs, Field, Hidden, Notice } from '@/components/ui';
import { Submit } from '@/components/client';
import { ProposalDoc, proposalTotals } from '@/components/ProposalDoc';
import { Icon } from '@/components/Icon';
import { clientProposalDecide } from '../../../actions';
import { dateY, money, today } from '@/lib/format';
import type { Proposal, ProposalItem } from '@/lib/types';

export default async function PortalProposal({ params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params;
  const { supabase, ws, contact } = await requirePortal(slug);
  const { data } = await supabase.from('proposals').select('*, proposal_items(*)').eq('id', id).eq('contact_id', contact.id).neq('status', 'draft').maybeSingle();
  if (!data) notFound();
  const q = data as Proposal & { proposal_items: ProposalItem[] };
  const items = [...q.proposal_items].sort((a, b) => (a.position || 0) - (b.position || 0));
  const t = proposalTotals(items, q.vat, Number(ws.vat_rate), q.deposit_pct);
  const expired = !!q.valid_until && q.valid_until < today();
  const b = `/p/${slug}`;
  return (
    <div className="page">
      <Crumbs items={[['Proposals', `${b}/proposals`], [q.number]]} />
      <div className="split">
        <ProposalDoc ws={ws} q={q} items={items} contact={contact} forClient />
        <div className="stack side-sticky">
          {q.status === 'sent' && (expired ? <Card><Notice tone="warn" icon="clock">This proposal expired on {dateY(q.valid_until)}. Message {ws.name} for an updated one.</Notice><Link className="btn block" href={`${b}/messages`}><Icon name="chat" />Message {ws.name}</Link></Card> : <>
            <Card title="Accept this proposal" icon="check">
              <p className="light num" style={{ fontSize: '1.9rem', lineHeight: 1 }}>{money(t.total, ws.currency)}</p>
              {q.deposit_pct > 0 && <p className="muted small">{money(t.depositWithVat, ws.currency)} deposit to start ({q.deposit_pct}%)</p>}
              <form action={clientProposalDecide} className="col g12"><Hidden v={{ slug, id, decision: 'accept' }} />
                <Field label="Your full name"><input className="inp" name="name" id="pa-name" defaultValue={contact.name} required autoComplete="name" /></Field>
                <label className="check"><input type="checkbox" name="agree" /> <span>I accept this proposal from {ws.legal_name || ws.name}.</span></label>
                <Submit className="btn primary lg block" pending="Accepting…"><Icon name="check" />Accept and continue</Submit>
                <p className="muted xs">Next you&apos;ll sign the agreement{q.deposit_pct > 0 ? ' and can pay the deposit' : ''}.</p>
              </form>
            </Card>
            <details className="card"><summary style={{ cursor: 'pointer' }} className="small">Not quite right?</summary>
              <form action={clientProposalDecide} className="col g8" style={{ marginTop: 10 }}><Hidden v={{ slug, id, decision: 'decline' }} />
                <Field label="Tell us why" optional hint={`Or message ${ws.name} to ask for changes instead.`}><textarea className="inp ta" name="reason" id="pa-reason" rows={3} /></Field>
                <Submit className="btn block" pending="Sending…">Decline proposal</Submit>
              </form>
            </details>
          </>)}
          {q.status === 'accepted' && <Card><Notice tone="good" icon="check">You accepted this proposal. Thank you!</Notice>
            {q.contract_id && <Link className="btn primary block" href={`${b}/contracts/${q.contract_id}`}><Icon name="sign" />Review the agreement</Link>}
            {q.invoice_id && <Link className="btn block" href={`${b}/invoices/${q.invoice_id}`}><Icon name="receipt" />Deposit invoice</Link>}</Card>}
          {q.status === 'declined' && <Card><Notice tone="plain" icon="x">You declined this proposal.</Notice><Link className="btn block" href={`${b}/messages`}><Icon name="chat" />Message {ws.name}</Link></Card>}
        </div>
      </div>
    </div>
  );
}
