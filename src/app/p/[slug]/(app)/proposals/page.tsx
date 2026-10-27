import Link from 'next/link';
import { requirePortal } from '@/lib/auth';
import { Card, Empty, PageHead, proposalChip } from '@/components/ui';
import { Icon } from '@/components/Icon';
import { date, money } from '@/lib/format';
import type { Proposal, ProposalItem } from '@/lib/types';

export const metadata = { title: 'Proposals' };

export default async function PortalProposals({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { supabase, ws, contact } = await requirePortal(slug);
  const { data } = await supabase.from('proposals').select('*, proposal_items(qty, rate)').eq('contact_id', contact.id).neq('status', 'draft').order('sent_at', { ascending: false });
  const all = (data || []) as (Proposal & { proposal_items: ProposalItem[] })[];
  return (
    <div className="page">
      <PageHead eyebrow={ws.name} title="Proposals" sub="Review what's included and accept to get started." />
      <Card>{all.length ? <div className="rows">{all.map((q) => (
        <Link key={q.id} className="lrow" href={`/p/${slug}/proposals/${q.id}`}><span className="ftype"><Icon name="doc" /></span>
          <div className="grow"><b>{q.title}</b><p>{q.number} · {money(q.proposal_items.reduce((s, i) => s + Number(i.qty) * Number(i.rate), 0), ws.currency)}{q.vat ? ' + VAT' : ''} · {date(q.sent_at)}</p></div>{proposalChip(q.status, true)}</Link>
      ))}</div> : <Empty icon="doc" title="No proposals yet" text={`When ${ws.name} sends a proposal, it appears here.`} />}</Card>
    </div>
  );
}
