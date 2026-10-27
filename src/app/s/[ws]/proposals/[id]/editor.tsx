'use client';
import { useMemo, useState } from 'react';
import { Icon } from '@/components/Icon';
import { Submit } from '@/components/client';
import { saveProposal } from '../../more-actions';
import type { Proposal, ProposalItem } from '@/lib/types';

const fmt = (n: number, cur: string) => (cur === 'NGN' ? '₦' : cur + ' ') + n.toLocaleString('en-NG', { maximumFractionDigits: 2 });
const blank = (): ProposalItem => ({ description: '', detail: '', qty: 1, rate: 0 });

export function ProposalEditor({ slug, q, items: initial, templates, vatRate, currency }: { slug: string; q: Proposal; items: ProposalItem[]; templates: { id: string; name: string }[]; vatRate: number; currency: string }) {
  const [items, setItems] = useState<ProposalItem[]>(initial.length ? initial.map((i) => ({ description: i.description, detail: i.detail || '', qty: Number(i.qty), rate: Number(i.rate) })) : [blank()]);
  const [vat, setVat] = useState(q.vat);
  const [dep, setDep] = useState(q.deposit_pct);
  const sub = useMemo(() => items.reduce((s, i) => s + (Number(i.qty) || 0) * (Number(i.rate) || 0), 0), [items]);
  const vatAmt = vat ? Math.round(sub * vatRate) / 100 : 0;
  const set = (k: number, patch: Partial<ProposalItem>) => setItems((x) => x.map((it, i) => (i === k ? { ...it, ...patch } : it)));
  return (
    <form action={saveProposal} className="split">
      <input type="hidden" name="ws" value={slug} /><input type="hidden" name="id" value={q.id} /><input type="hidden" name="items" value={JSON.stringify(items)} />
      <section className="card" style={{ gap: 18 }}>
        <div className="fields">
          <label className="field"><span>Title</span><input className="inp" name="title" id="pe-title" defaultValue={q.title} /></label>
          <label className="field"><span>Service</span><input className="inp" name="service" id="pe-service" defaultValue={q.service} placeholder="e.g. Brand identity" /></label>
        </div>
        <label className="field"><span>Introduction</span><textarea className="inp ta" name="intro" id="pe-intro" rows={6} defaultValue={q.intro} placeholder="What you understood about their goals, your approach, timeline and what they'll receive." /></label>
        <div className="col g8">
          <b className="small">Packages and line items</b>
          {items.map((it, k) => (
            <div key={k} className="sub col g8">
              <div className="row"><input className="inp grow" aria-label="Item" value={it.description} onChange={(e) => set(k, { description: e.target.value })} placeholder="e.g. Logo and identity system" />
                <button type="button" className="ibtn xs" aria-label="Remove item" onClick={() => setItems((x) => (x.length === 1 ? [blank()] : x.filter((_, i) => i !== k)))}><Icon name="trash" /></button></div>
              <textarea className="inp ta" aria-label="Details" rows={2} style={{ minHeight: 60 }} value={it.detail || ''} onChange={(e) => set(k, { detail: e.target.value })} placeholder="What's included (optional)" />
              <div className="row"><label className="field" style={{ width: 90 }}><span>Qty</span><input className="inp num" type="number" min="0" step="0.5" value={it.qty} onChange={(e) => set(k, { qty: Number(e.target.value) })} /></label>
                <label className="field grow"><span>Price</span><input className="inp num" type="number" min="0" step="1000" value={it.rate} onChange={(e) => set(k, { rate: Number(e.target.value) })} /></label>
                <span className="num" style={{ alignSelf: 'flex-end', padding: '0 0 10px' }}>{fmt((Number(it.qty) || 0) * (Number(it.rate) || 0), currency)}</span></div>
            </div>
          ))}
          <button type="button" className="btn" style={{ alignSelf: 'flex-start' }} onClick={() => setItems((x) => [...x, blank()])}><Icon name="plus" />Add item</button>
        </div>
        <div className="fields">
          <label className="field"><span>Deposit to start (%)</span><input className="inp num" type="number" min={0} max={100} name="deposit_pct" id="pe-dep" value={dep} onChange={(e) => setDep(Number(e.target.value))} /></label>
          <label className="field"><span>Valid until</span><input className="inp" type="date" name="valid_until" id="pe-valid" defaultValue={q.valid_until || ''} /></label>
        </div>
        <label className="field"><span>Agreement template</span><select className="sel" name="template_id" id="pe-tpl" defaultValue={q.template_id || ''}><option value="">No agreement</option>{templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
        <label className="setrow"><div className="grow"><b>Charge VAT at {vatRate}%</b><p>Added to the total and the deposit invoice</p></div><span className="switch-native"><input type="checkbox" name="vat" checked={vat} onChange={(e) => setVat(e.target.checked)} /><span className="tog" /></span></label>
      </section>
      <div className="stack side-sticky">
        <section className="card">
          <p className="eyebrow">{q.number} · draft</p>
          <div className="totals" style={{ width: '100%' }}>
            <div><span className="muted">Subtotal</span><span className="num">{fmt(sub, currency)}</span></div>
            {vat && <div><span className="muted">VAT {vatRate}%</span><span className="num">{fmt(vatAmt, currency)}</span></div>}
            <div className="grand"><span>Total</span><span className="num">{fmt(sub + vatAmt, currency)}</span></div>
            {dep > 0 && <div><span className="muted">Deposit ({dep}%)</span><span className="num">{fmt(Math.round((sub + vatAmt) * dep) / 100, currency)}</span></div>}
          </div>
          <Submit className="btn primary lg block" name="then" value="send" pending="Sending…"><Icon name="send" />Save and send</Submit>
          <Submit className="btn block" pending="Saving…">Save draft</Submit>
          <p className="muted xs">When the client accepts, Onera creates the project, sends the agreement (signed by you) and the deposit invoice.</p>
        </section>
      </div>
    </form>
  );
}
