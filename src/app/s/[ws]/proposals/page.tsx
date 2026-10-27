import Link from 'next/link';
import { requireMember } from '@/lib/auth';
import { Card, Empty, Field, Hidden, PageHead, proposalChip } from '@/components/ui';
import { Submit } from '@/components/client';
import { Icon } from '@/components/Icon';
import { createProposal } from '../more-actions';
import { date, money, shortMoney } from '@/lib/format';
import type { Contact, Proposal, ProposalItem } from '@/lib/types';

export const metadata = { title: 'Proposals' };

export default async function Proposals({ params, searchParams }: { params: Promise<{ ws: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { ws: slug } = await params; const sp = await searchParams;
  const { supabase, ws } = await requireMember(slug);
  const f = sp.f || 'all';
  const [{ data }, { data: contacts }] = await Promise.all([
    supabase.from('proposals').select('*, contacts(name, company), proposal_items(qty, rate)').eq('workspace_id', ws.id).order('created_at', { ascending: false }).limit(300),
    supabase.from('contacts').select('id, name, company').eq('workspace_id', ws.id).order('name'),
  ]);
  const all = (data || []) as (Proposal & { contacts: Contact; proposal_items: ProposalItem[] })[];
  const val = (q: { proposal_items: ProposalItem[] }) => q.proposal_items.reduce((s, i) => s + Number(i.qty) * Number(i.rate), 0);
  const list = all.filter((q) => f === 'all' || q.status === f);
  const sum = (st: string) => all.filter((q) => q.status === st).reduce((s, q) => s + val(q), 0);
  const decided = all.filter((q) => q.status === 'accepted' || q.status === 'declined');
  const rate = decided.length ? Math.round((all.filter((q) => q.status === 'accepted').length / decided.length) * 100) : null;
  const b = `/s/${slug}/proposals`;
  return (
    <div className="page">
      <PageHead eyebrow="Win the work" title="Proposals" actions={<Link className="btn primary" href={`${b}?new=1`}><Icon name="plus" />New proposal</Link>} />
      {sp.new && (
        <form className="card" action={createProposal}><Hidden v={{ ws: slug }} />
          <div className="chead"><span className="t"><Icon name="doc" />New proposal</span><Link className="ibtn sm" href={b} aria-label="Close"><Icon name="x" /></Link></div>
          <div className="fields">
            <Field label="For"><select className="sel" name="contact_id" id="np-contact" required defaultValue=""><option value="" disabled>Choose a contact</option>{(contacts || []).map((c) => <option key={c.id} value={c.id}>{c.name}{c.company ? ` · ${c.company}` : ''}</option>)}</select></Field>
            <Field label="Service"><input className="inp" name="service" id="np-service" placeholder="e.g. Website design" /></Field>
          </div>
          <div className="row"><span className="muted xs">Tip: start from a lead to fill this in for you.</span><span className="sp" /><Submit pending="Creating…">Create draft</Submit></div>
        </form>
      )}
      <div className="g4">
        <div className="card stat"><span className="eyebrow">Waiting on clients</span><span className="v">{shortMoney(sum('sent'), ws.currency)}</span><span className="muted xs">{all.filter((q) => q.status === 'sent').length} sent</span></div>
        <div className="card stat"><span className="eyebrow">Won</span><span className="v" style={{ color: 'var(--good)' }}>{shortMoney(sum('accepted'), ws.currency)}</span></div>
        <div className="card stat"><span className="eyebrow">Win rate</span><span className="v">{rate === null ? '–' : `${rate}%`}</span></div>
        <div className="card stat"><span className="eyebrow">Drafts</span><span className="v">{all.filter((q) => q.status === 'draft').length}</span></div>
      </div>
      <Card>
        <div className="tabbar">{[['all', 'All'], ['sent', 'Sent'], ['accepted', 'Accepted'], ['declined', 'Declined'], ['draft', 'Drafts']].map(([k, l]) => <Link key={k} className="tablink" data-on={f === k} href={`${b}?f=${k}`}>{l}</Link>)}</div>
        {list.length ? <div className="tblwrap"><table className="tbl"><thead><tr><th>Proposal</th><th>Client</th><th>Sent</th><th>Status</th><th className="r">Value</th></tr></thead><tbody>
          {list.map((q) => <tr key={q.id}><td><Link href={`${b}/${q.id}`} style={{ color: 'inherit', textDecoration: 'none' }}><b style={{ fontWeight: 500 }}>{q.title}</b><div className="mono xs muted">{q.number}</div></Link></td><td>{q.contacts?.name}</td><td>{q.sent_at ? date(q.sent_at) : '–'}</td><td>{proposalChip(q.status)}</td><td className="r num">{money(val(q), ws.currency)}</td></tr>)}
        </tbody></table></div> : <Empty icon="doc" title="No proposals here" text="Send a proposal; when the client accepts, the project, agreement and deposit invoice are created for you."><Link className="btn primary" href={`${b}?new=1`}>Write a proposal</Link></Empty>}
      </Card>
    </div>
  );
}
