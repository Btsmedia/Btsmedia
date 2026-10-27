import { notFound } from 'next/navigation';
import { requirePortal } from '@/lib/auth';
import { Card, Crumbs, Hidden, Notice } from '@/components/ui';
import { Submit } from '@/components/client';
import { InvoiceDoc } from '@/components/docs';
import { Icon } from '@/components/Icon';
import { clientTransferSent, startPayment } from '../../../actions';
import { totalOf } from '@/lib/data';
import { date, dateY, money, relDue } from '@/lib/format';
import type { Invoice, InvoiceItem, Project } from '@/lib/types';

export default async function PortalInvoice({ params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params;
  const { supabase, ws, contact } = await requirePortal(slug);
  const { data } = await supabase.from('invoices').select('*, invoice_items(*)').eq('id', id).eq('contact_id', contact.id).neq('status', 'draft').maybeSingle();
  if (!data) notFound();
  const inv = data as Invoice & { invoice_items: InvoiceItem[] };
  const items = [...inv.invoice_items].sort((a, b) => (a.position || 0) - (b.position || 0));
  const [tot, { data: proj }, { data: payments }] = await Promise.all([
    totalOf(supabase, id),
    inv.project_id ? supabase.from('projects').select('*').eq('id', inv.project_id).maybeSingle() : Promise.resolve({ data: null }),
    supabase.from('payments').select('amount, method, paid_at, status').eq('invoice_id', id).eq('status', 'success').order('paid_at', { ascending: false }),
  ]);
  const balance = Math.max(0, tot.total - tot.paid);
  const fee = inv.pass_fees && ws.pass_card_fees ? Math.round(balance * Number(ws.card_fee_pct)) / 100 : 0;
  const canPay = ['sent', 'processing'].includes(inv.status) && balance > 0;
  const b = `/p/${slug}`;
  return (
    <div className="page">
      <Crumbs items={[['Invoices', `${b}/invoices`], [inv.number]]} />
      <div className="split">
        <InvoiceDoc ws={ws} inv={inv} items={items} totals={tot} contact={contact} project={proj as Project | null} />
        <div className="stack side-sticky">
          <Card>
            <p className="eyebrow">{inv.status === 'paid' ? 'Paid in full' : 'Amount due'}</p>
            <p className="light num" style={{ fontSize: '2.2rem', lineHeight: 1 }}>{money(inv.status === 'paid' ? tot.total : balance, ws.currency)}</p>
            {inv.status === 'sent' && <Notice tone={tot.is_overdue ? 'urgent' : 'warn'} icon="clock">{tot.is_overdue ? 'Overdue: ' : 'Due '}{relDue(inv.due_on)} ({dateY(inv.due_on)})</Notice>}
            {inv.status === 'processing' && <Notice tone="info" icon="bank">You told {ws.name} the transfer is sent. They&apos;ll confirm once it arrives. You can still pay by card if you prefer.</Notice>}
            {inv.status === 'paid' && <Notice tone="good" icon="check">Paid {inv.paid_on ? dateY(inv.paid_on) : ''}. Thank you.</Notice>}
            {inv.status === 'void' && <Notice tone="plain" icon="x">{ws.name} cancelled this invoice. Nothing to pay.</Notice>}
            {canPay && (ws.paystack_subaccount_code ? (
              <form action={startPayment} className="col g8"><Hidden v={{ slug, id }} />
                <Submit className="btn primary lg block" pending="Opening checkout…"><Icon name="card" />Pay {money(balance + fee, ws.currency)} by card</Submit>
                <p className="muted xs">Secure checkout by Paystack: card, bank, USSD or transfer.{fee ? ` Includes a ${Number(ws.card_fee_pct)}% card fee (${money(fee, ws.currency, true)}).` : ''}</p>
              </form>
            ) : <p className="muted small">Card payments aren&apos;t set up yet. Please pay by bank transfer.</p>)}
            <a className="btn block" href={`/api/invoices/${id}/pdf`}><Icon name="download" />Download PDF</a>
          </Card>
          {canPay && ws.bank_account_number && (
            <Card title="Pay by bank transfer" icon="bank">
              <div className="rows">
                <div className="lrow"><div className="grow"><p>Bank</p><b>{ws.bank_name}</b></div></div>
                <div className="lrow"><div className="grow"><p>Account name</p><b>{ws.bank_account_name}</b></div></div>
                <div className="lrow"><div className="grow"><p>Account number</p><b className="mono">{ws.bank_account_number}</b></div></div>
                <div className="lrow"><div className="grow"><p>Reference</p><b className="mono">{inv.number}</b></div></div>
              </div>
              {inv.status === 'sent' && <form action={clientTransferSent}><Hidden v={{ slug, id }} /><Submit className="btn block" pending="Letting them know…"><Icon name="check" />I&apos;ve sent the transfer</Submit></form>}
            </Card>
          )}
          {(payments || []).length > 0 && (
            <Card title="Payments" icon="receipt"><div className="rows">{(payments || []).map((p, i) => <div key={i} className="lrow"><div className="grow"><b className="num">{money(p.amount, ws.currency)}</b><p>{p.method} · {date(p.paid_at)}</p></div></div>)}</div></Card>
          )}
        </div>
      </div>
    </div>
  );
}
