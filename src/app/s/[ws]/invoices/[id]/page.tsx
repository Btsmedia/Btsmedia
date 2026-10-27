import { notFound } from 'next/navigation';
import { requireMember } from '@/lib/auth';
import { Card, Crumbs, Field, Hidden, Notice, PageHead } from '@/components/ui';
import { ConfirmSubmit, CopyButton, Submit } from '@/components/client';
import { InvoiceDoc } from '@/components/docs';
import { Icon } from '@/components/Icon';
import { InvoiceEditor } from './editor';
import { invoiceAction } from '../../actions';
import { totalOf } from '@/lib/data';
import { portalUrl } from '@/lib/env';
import { date, money, relDue, today, when } from '@/lib/format';
import type { Activity, Contact, Invoice, InvoiceItem, Project } from '@/lib/types';

export default async function InvoicePage({ params, searchParams }: { params: Promise<{ ws: string; id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { ws: slug, id } = await params; const sp = await searchParams;
  const { supabase, ws } = await requireMember(slug);
  const { data } = await supabase.from('invoices').select('*, contacts(*), projects(*), invoice_items(*)').eq('id', id).eq('workspace_id', ws.id).maybeSingle();
  if (!data) notFound();
  const inv = data as Invoice & { contacts: Contact; projects: Project | null; invoice_items: InvoiceItem[] };
  const items = [...inv.invoice_items].sort((a, b) => (a.position || 0) - (b.position || 0));
  const b = `/s/${slug}`;
  const crumbs = <Crumbs items={[['Invoices', `${b}/invoices`], [inv.number]]} />;

  if (inv.status === 'draft') {
    const [{ data: contacts }, { data: projects }] = await Promise.all([
      supabase.from('contacts').select('id, name, company').eq('workspace_id', ws.id).order('name'),
      supabase.from('projects').select('id, name, contact_id').eq('workspace_id', ws.id).in('status', ['active', 'on_hold']),
    ]);
    return (
      <div className="page">{crumbs}<PageHead eyebrow={`Draft · ${inv.contacts.name}`} title={inv.title} />
        <InvoiceEditor slug={slug} inv={inv} items={items} contacts={contacts || []} projects={projects || []} vatRate={Number(ws.vat_rate)} currency={ws.currency} cardFee={Number(ws.card_fee_pct)} />
        <form action={invoiceAction} className="row"><Hidden v={{ ws: slug, id, op: 'delete' }} /><span className="sp" /><ConfirmSubmit className="btn ghost" confirm="Click again to delete this draft"><Icon name="trash" />Delete draft</ConfirmSubmit></form>
      </div>
    );
  }

  const tot = await totalOf(supabase, id);
  const [{ data: payments }, { data: activity }] = await Promise.all([
    supabase.from('payments').select('*').eq('invoice_id', id).order('paid_at', { ascending: false }),
    supabase.from('activity').select('*').eq('entity_id', id).order('created_at', { ascending: false }),
  ]);
  const balance = Math.max(0, tot.total - tot.paid);
  const open = ['sent', 'processing'].includes(inv.status);
  return (
    <div className="page">
      {crumbs}
      {sp.invite && <Notice tone="info" icon="link"><div className="col g8"><span>{inv.contacts.name} hasn&apos;t joined the portal yet. Email isn&apos;t configured, so share this one-time link with them:</span><span className="mono xs" style={{ wordBreak: 'break-all' }}>{sp.invite}</span><CopyButton text={sp.invite} label="Copy link" /></div></Notice>}
      <div className="split">
        <InvoiceDoc ws={ws} inv={inv} items={items} totals={tot} contact={inv.contacts} project={inv.projects} />
        <div className="stack side-sticky">
          <Card>
            <p className="eyebrow">{inv.status === 'paid' ? 'Paid in full' : 'Balance'}</p>
            <p className="light num" style={{ fontSize: '2.2rem', lineHeight: 1 }}>{money(inv.status === 'paid' ? tot.total : balance, ws.currency)}</p>
            {inv.status === 'processing' && <Notice tone="info" icon="bank">{inv.contacts.name} says the transfer is sent. Check your account, then record the payment.</Notice>}
            {inv.status === 'sent' && <Notice tone={tot.is_overdue ? 'urgent' : 'warn'} icon="clock">{tot.is_overdue ? 'Overdue: ' : ''}{relDue(inv.due_on)} ({date(inv.due_on)})</Notice>}
            {inv.status === 'void' && <Notice tone="plain" icon="x">Void. The client can no longer pay it.</Notice>}
            <div className="row"><a className="btn block" href={`/api/invoices/${id}/pdf`}><Icon name="download" />PDF</a><CopyButton text={portalUrl(slug, `/invoices/${id}`)} label="Client link" /></div>
            <form action={invoiceAction}><Hidden v={{ ws: slug, id, op: 'duplicate' }} /><Submit className="btn block" pending="Copying…"><Icon name="copy" />Duplicate</Submit></form>
          </Card>
          {open && (
            <form className="card" action={invoiceAction}>
              <Hidden v={{ ws: slug, id, op: 'record' }} />
              <div className="chead"><span className="t"><Icon name="check" />Record a payment</span></div>
              <div className="fields"><Field label="Amount"><input className="inp num" type="number" step="0.01" min="0" name="amount" id="rp-amt" defaultValue={balance} /></Field><Field label="Date"><input className="inp" type="date" name="paid_on" id="rp-date" defaultValue={today()} /></Field></div>
              <div className="fields"><Field label="Method"><select className="sel" name="method" id="rp-method"><option>Bank transfer</option><option>Cash</option><option>Card (outside Onera)</option><option>Cheque</option></select></Field><Field label="Reference" optional><input className="inp" name="reference" id="rp-ref" /></Field></div>
              <Submit pending="Recording…">Record payment</Submit>
            </form>
          )}
          {open && <div className="row"><form action={invoiceAction} style={{ flex: 1 }}><Hidden v={{ ws: slug, id, op: 'remind' }} /><Submit className="btn block" pending="Sending…"><Icon name="bell" />Send reminder</Submit></form><form action={invoiceAction} style={{ flex: 1 }}><Hidden v={{ ws: slug, id, op: 'void' }} /><ConfirmSubmit className="btn ghost block" confirm="Void it?">Void</ConfirmSubmit></form></div>}
          <Card title="History" icon="clock">
            <div className="timeline">
              {(payments || []).map((p) => <div key={p.id} className="tl"><i /><div>{p.status === 'success' ? 'Paid' : p.status === 'pending' ? 'Checkout started for' : 'Failed payment of'} {money(p.amount, ws.currency)} · {p.method}<small>{when(p.paid_at)}{p.reference ? ' · ' + p.reference : ''}</small></div></div>)}
              {((activity || []) as Activity[]).map((a) => <div key={a.id} className="tl muted"><i /><div><b style={{ fontWeight: 500 }}>{a.actor_name}</b> {a.message}<small>{when(a.created_at)}</small></div></div>)}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
