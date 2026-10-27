import Link from 'next/link';
import { requireMember } from '@/lib/auth';
import { Card, Field, Hidden, PageHead, invoiceChip } from '@/components/ui';
import { Submit } from '@/components/client';
import { Icon } from '@/components/Icon';
import { createInvoice } from '../actions';
import { totalsFor } from '@/lib/data';
import { date, money, shortMoney, today } from '@/lib/format';
import type { Contact, Invoice } from '@/lib/types';

export const metadata = { title: 'Invoices' };

export default async function Invoices({ params, searchParams }: { params: Promise<{ ws: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { ws: slug } = await params; const sp = await searchParams;
  const { supabase, ws } = await requireMember(slug);
  const f = sp.f || 'all';
  const [{ data }, { data: contacts }] = await Promise.all([
    supabase.from('invoices').select('*, contacts(name, company)').eq('workspace_id', ws.id).order('created_at', { ascending: false }).limit(500),
    supabase.from('contacts').select('id, name, company').eq('workspace_id', ws.id).order('name'),
  ]);
  const all = (data || []) as (Invoice & { contacts: Contact })[];
  const tot = await totalsFor(supabase, all.map((i) => i.id));
  const over = (i: Invoice) => i.status === 'sent' && i.due_on < today();
  const list = all.filter((i) => f === 'all' || (f === 'overdue' ? over(i) : f === 'due' ? ['sent', 'processing'].includes(i.status) && !over(i) : i.status === f));
  const sum = (pred: (i: Invoice) => boolean) => all.filter(pred).reduce((s, i) => s + tot[i.id].total - tot[i.id].paid, 0);
  const b = `/s/${slug}/invoices`;
  return (
    <div className="page">
      <PageHead eyebrow="Billing" title="Invoices" actions={<Link className="btn primary" href={`${b}?new=1`}><Icon name="plus" />New invoice</Link>} />
      {sp.new && (
        <form className="card" action={createInvoice}>
          <Hidden v={{ ws: slug }} />
          <div className="chead"><span className="t"><Icon name="receipt" />New invoice</span><Link className="ibtn sm" href={b} aria-label="Close"><Icon name="x" /></Link></div>
          <div className="fields"><Field label="Bill to"><select className="sel" name="contact_id" id="ni-contact" required defaultValue=""><option value="" disabled>Choose a client</option>{(contacts || []).map((c) => <option key={c.id} value={c.id}>{c.name}{c.company ? ` · ${c.company}` : ''}</option>)}</select></Field><Field label="Title"><input className="inp" name="title" id="ni-title" placeholder="e.g. Deposit (40%)" /></Field></div>
          <div className="row"><span className="sp" /><Submit pending="Creating…">Create draft</Submit></div>
        </form>
      )}
      <div className="g4">
        <div className="card stat"><span className="eyebrow">Outstanding</span><span className="v">{shortMoney(sum((i) => ['sent', 'processing'].includes(i.status)), ws.currency)}</span></div>
        <div className="card stat"><span className="eyebrow">Overdue</span><span className="v" style={{ color: 'var(--urgent)' }}>{shortMoney(sum(over), ws.currency)}</span></div>
        <div className="card stat"><span className="eyebrow">Confirming</span><span className="v">{all.filter((i) => i.status === 'processing').length}</span><span className="muted xs">Transfers to check</span></div>
        <div className="card stat"><span className="eyebrow">Drafts</span><span className="v">{all.filter((i) => i.status === 'draft').length}</span></div>
      </div>
      <Card>
        <div className="tabbar">{[['all', 'All'], ['due', 'Due'], ['overdue', 'Overdue'], ['processing', 'Confirming'], ['paid', 'Paid'], ['draft', 'Drafts'], ['void', 'Void']].map(([k, l]) => <Link key={k} className="tablink" data-on={f === k} href={`${b}?f=${k}`}>{l}</Link>)}</div>
        {list.length ? <div className="tblwrap"><table className="tbl"><thead><tr><th>Invoice</th><th>Client</th><th>Issued</th><th>Due</th><th>Status</th><th className="r">Amount</th></tr></thead><tbody>
          {list.map((i) => <tr key={i.id}><td><Link href={`${b}/${i.id}`} style={{ color: 'inherit', textDecoration: 'none' }}><b style={{ fontWeight: 500 }}>{i.title}</b><div className="mono xs muted">{i.number}</div></Link></td><td>{i.contacts.name}</td><td>{i.issued_on ? date(i.issued_on) : '–'}</td><td>{date(i.due_on)}</td><td>{invoiceChip(i.status, tot[i.id].is_overdue, i.due_on)}</td><td className="r num">{money(tot[i.id].total, ws.currency)}</td></tr>)}
        </tbody></table></div> : <div className="empty"><b>No invoices here</b><Link className="btn primary" href={`${b}?new=1`}>Create an invoice</Link></div>}
      </Card>
    </div>
  );
}
