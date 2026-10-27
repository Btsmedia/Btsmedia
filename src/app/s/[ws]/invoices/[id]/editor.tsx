'use client';
import { useMemo, useState } from 'react';
import { Icon } from '@/components/Icon';
import { Submit } from '@/components/client';
import { saveInvoice } from '../../actions';
import type { Invoice, InvoiceItem } from '@/lib/types';

const fmt = (n: number, cur: string) => (cur === 'NGN' ? '₦' : cur + ' ') + n.toLocaleString('en-NG', { maximumFractionDigits: 2 });

export function InvoiceEditor({ slug, inv, items: initial, contacts, projects, vatRate, currency, cardFee }: {
  slug: string; inv: Invoice; items: InvoiceItem[]; contacts: { id: string; name: string; company: string | null }[];
  projects: { id: string; name: string; contact_id: string }[]; vatRate: number; currency: string; cardFee: number;
}) {
  const [items, setItems] = useState<InvoiceItem[]>(initial.length ? initial.map((i) => ({ description: i.description, qty: Number(i.qty), rate: Number(i.rate) })) : [{ description: '', qty: 1, rate: 0 }]);
  const [vat, setVat] = useState(inv.vat);
  const [fees, setFees] = useState(inv.pass_fees);
  const [contact, setContact] = useState(inv.contact_id);
  const sub = useMemo(() => items.reduce((s, i) => s + (Number(i.qty) || 0) * (Number(i.rate) || 0), 0), [items]);
  const vatAmt = vat ? Math.round(sub * vatRate) / 100 : 0;
  const set = (k: number, patch: Partial<InvoiceItem>) => setItems((x) => x.map((it, i) => (i === k ? { ...it, ...patch } : it)));

  return (
    <form action={saveInvoice} className="split">
      <input type="hidden" name="ws" value={slug} /><input type="hidden" name="id" value={inv.id} /><input type="hidden" name="items" value={JSON.stringify(items)} />
      <section className="card" style={{ gap: 18 }}>
        <div className="fields">
          <label className="field"><span>Bill to</span><select className="sel" name="contact_id" id="ie-contact" value={contact} onChange={(e) => setContact(e.target.value)}>{contacts.map((c) => <option key={c.id} value={c.id}>{c.name}{c.company ? ` · ${c.company}` : ''}</option>)}</select></label>
          <label className="field"><span>Project</span><select className="sel" name="project_id" id="ie-project" defaultValue={inv.project_id || ''}><option value="">No project</option>{projects.filter((p) => p.contact_id === contact).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
        </div>
        <div className="fields">
          <label className="field"><span>Title</span><input className="inp" name="title" id="ie-title" defaultValue={inv.title} /></label>
          <label className="field"><span>Due date</span><input className="inp" type="date" name="due_on" id="ie-due" defaultValue={inv.due_on} /></label>
        </div>
        <div className="col g8">
          <b className="small">Line items</b>
          <div className="tblwrap"><table className="items" style={{ minWidth: 560 }}><thead><tr><th>Description</th><th className="r" style={{ width: 80 }}>Qty</th><th className="r" style={{ width: 150 }}>Rate</th><th className="r" style={{ width: 120 }}>Amount</th><th style={{ width: 36 }} /></tr></thead><tbody>
            {items.map((it, k) => (
              <tr key={k}>
                <td style={{ paddingRight: 8 }}><input className="inp" aria-label="Description" id={`li-d-${k}`} value={it.description} onChange={(e) => set(k, { description: e.target.value })} placeholder="What you're charging for" /></td>
                <td style={{ paddingRight: 8 }}><input className="inp num" aria-label="Quantity" id={`li-q-${k}`} type="number" min="0" step="0.5" value={it.qty} onChange={(e) => set(k, { qty: Number(e.target.value) })} style={{ textAlign: 'right' }} /></td>
                <td style={{ paddingRight: 8 }}><input className="inp num" aria-label="Rate" id={`li-r-${k}`} type="number" min="0" step="1000" value={it.rate} onChange={(e) => set(k, { rate: Number(e.target.value) })} style={{ textAlign: 'right' }} /></td>
                <td className="r" style={{ verticalAlign: 'middle' }}>{fmt((Number(it.qty) || 0) * (Number(it.rate) || 0), currency)}</td>
                <td style={{ verticalAlign: 'middle' }}><button type="button" className="ibtn xs" aria-label="Remove line" onClick={() => setItems((x) => (x.length === 1 ? [{ description: '', qty: 1, rate: 0 }] : x.filter((_, i) => i !== k)))}><Icon name="trash" /></button></td>
              </tr>
            ))}
          </tbody></table></div>
          <button type="button" className="btn" style={{ alignSelf: 'flex-start' }} onClick={() => setItems((x) => [...x, { description: '', qty: 1, rate: 0 }])}><Icon name="plus" />Add line</button>
        </div>
        <label className="setrow"><div className="grow"><b>Charge VAT at {vatRate}%</b><p>Shows VAT and your tax ID on the invoice</p></div><span className="switch-native"><input type="checkbox" name="vat" checked={vat} onChange={(e) => setVat(e.target.checked)} /><span className="tog" /></span></label>
        <label className="setrow"><div className="grow"><b>Client pays the card fee</b><p>Adds {cardFee}% at checkout for card payments only</p></div><span className="switch-native"><input type="checkbox" name="pass_fees" checked={fees} onChange={(e) => setFees(e.target.checked)} /><span className="tog" /></span></label>
        <label className="field"><span>Note on the invoice <span className="muted">(optional)</span></span><textarea className="ta" name="notes" id="ie-notes" defaultValue={inv.notes} placeholder="Payment terms, thank-you note" /></label>
      </section>
      <div className="stack side-sticky">
        <section className="card">
          <p className="eyebrow">{inv.number} · draft</p>
          <div className="totals" style={{ width: '100%' }}>
            <div><span className="muted">Subtotal</span><span className="num">{fmt(sub, currency)}</span></div>
            {vat && <div><span className="muted">VAT {vatRate}%</span><span className="num">{fmt(vatAmt, currency)}</span></div>}
            <div className="grand"><span>Total</span><span className="num">{fmt(sub + vatAmt, currency)}</span></div>
            {fees && <div><span className="muted">Card checkout total</span><span className="num">{fmt(Math.round((sub + vatAmt) * (1 + cardFee / 100)), currency)}</span></div>}
          </div>
          <Submit className="btn primary lg block" name="then" value="send" pending="Sending…"><Icon name="send" />Save and send</Submit>
          <Submit className="btn block" pending="Saving…">Save draft</Submit>
          <p className="muted xs">Sending emails the client a link to view and pay in their portal.</p>
        </section>
      </div>
    </form>
  );
}

