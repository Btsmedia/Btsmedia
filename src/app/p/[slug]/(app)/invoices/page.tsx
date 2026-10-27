import Link from 'next/link';
import { requirePortal } from '@/lib/auth';
import { Card, Empty, PageHead, invoiceChip } from '@/components/ui';
import { totalsFor } from '@/lib/data';
import { date, money } from '@/lib/format';
import type { Invoice } from '@/lib/types';

export const metadata = { title: 'Invoices' };

export default async function PortalInvoices({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { supabase, ws, contact } = await requirePortal(slug);
  const { data } = await supabase.from('invoices').select('*').eq('contact_id', contact.id).neq('status', 'draft').order('due_on', { ascending: false });
  const all = (data || []) as Invoice[];
  const tot = await totalsFor(supabase, all.map((i) => i.id));
  const open = all.filter((i) => ['sent', 'processing'].includes(i.status));
  const due = open.reduce((s, i) => s + tot[i.id].total - tot[i.id].paid, 0);
  const paid = all.reduce((s, i) => s + tot[i.id].paid, 0);
  const b = `/p/${slug}/invoices`;
  return (
    <div className="page">
      <PageHead eyebrow={ws.name} title="Invoices" sub="Pay by card or bank transfer. Receipts arrive by email." />
      <div className="g3">
        <div className="card stat"><span className="eyebrow">To pay</span><span className="v">{money(due, ws.currency)}</span><span className="muted xs">{open.length} open</span></div>
        <div className="card stat"><span className="eyebrow">Paid so far</span><span className="v">{money(paid, ws.currency)}</span></div>
        <div className="card stat"><span className="eyebrow">Overdue</span><span className="v" style={{ color: all.some((i) => tot[i.id].is_overdue) ? 'var(--urgent)' : undefined }}>{all.filter((i) => tot[i.id].is_overdue).length}</span></div>
      </div>
      <Card>
        {all.length ? <div className="tblwrap"><table className="tbl"><thead><tr><th>Invoice</th><th>Issued</th><th>Due</th><th>Status</th><th className="r">Amount</th></tr></thead><tbody>
          {all.map((i) => <tr key={i.id}><td><Link href={`${b}/${i.id}`} style={{ color: 'inherit', textDecoration: 'none' }}><b style={{ fontWeight: 500 }}>{i.title}</b><div className="mono xs muted">{i.number}</div></Link></td><td>{i.issued_on ? date(i.issued_on) : '–'}</td><td>{date(i.due_on)}</td><td>{invoiceChip(i.status, tot[i.id].is_overdue, i.due_on)}</td><td className="r num">{money(tot[i.id].total, ws.currency)}</td></tr>)}
        </tbody></table></div> : <Empty icon="receipt" title="No invoices yet" text={`When ${ws.name} sends you an invoice, it shows up here.`} />}
      </Card>
    </div>
  );
}
