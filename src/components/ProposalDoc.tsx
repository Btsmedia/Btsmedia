import { StudioMark } from './docs';
import { proposalChip } from './ui';
import { dateY, money } from '@/lib/format';
import type { Contact, Proposal, ProposalItem, Workspace } from '@/lib/types';

export function proposalTotals(items: ProposalItem[], vat: boolean, vatRate: number, depositPct: number) {
  const subtotal = items.reduce((s, i) => s + Number(i.qty) * Number(i.rate), 0);
  const vatAmt = vat ? Math.round(subtotal * vatRate) / 100 : 0;
  const deposit = Math.round(subtotal * depositPct) / 100;
  return { subtotal, vatAmt, total: subtotal + vatAmt, deposit, depositWithVat: vat ? Math.round(deposit * (100 + vatRate)) / 100 : deposit };
}

export function ProposalDoc({ ws, q, items, contact, forClient }: { ws: Workspace; q: Proposal; items: ProposalItem[]; contact: Contact; forClient?: boolean }) {
  const t = proposalTotals(items, q.vat, Number(ws.vat_rate), q.deposit_pct);
  return (
    <article className="doc">
      <div className="dhead">
        <div className="col g8"><StudioMark ws={ws} /><div className="small"><b>{ws.legal_name || ws.name}</b>{ws.email && <p className="muted">{ws.email}</p>}</div></div>
        <div className="col g6" style={{ textAlign: 'right' }}><p className="eyebrow">Proposal</p><p className="mono">{q.number}</p><div>{proposalChip(q.status, forClient)}</div></div>
      </div>
      <div className="col g8"><h1>{q.title}</h1><p className="muted small">Prepared for {contact.company || contact.name}{q.sent_at ? ` · ${dateY(q.sent_at)}` : ''}{q.valid_until ? ` · valid until ${dateY(q.valid_until)}` : ''}</p></div>
      {q.intro && <div className="legal"><p style={{ whiteSpace: 'pre-line' }}>{q.intro}</p></div>}
      <div className="tblwrap"><table className="items" style={{ minWidth: 460 }}><thead><tr><th>What&apos;s included</th><th className="r">Qty</th><th className="r">Price</th><th className="r">Amount</th></tr></thead><tbody>
        {items.map((it, i) => <tr key={i}><td><b style={{ fontWeight: 500 }}>{it.description}</b>{it.detail && <div className="muted small" style={{ whiteSpace: 'pre-line', marginTop: 2 }}>{it.detail}</div>}</td><td className="r">{Number(it.qty)}</td><td className="r">{money(it.rate, ws.currency)}</td><td className="r">{money(Number(it.qty) * Number(it.rate), ws.currency)}</td></tr>)}
      </tbody></table></div>
      <div className="totals">
        <div><span className="muted">Subtotal</span><span className="num">{money(t.subtotal, ws.currency, true)}</span></div>
        {q.vat && <div><span className="muted">VAT {Number(ws.vat_rate)}%</span><span className="num">{money(t.vatAmt, ws.currency, true)}</span></div>}
        <div className="grand"><span>Total</span><span className="num">{money(t.total, ws.currency, true)}</span></div>
        {q.deposit_pct > 0 && <div className="b"><span>Deposit to start ({q.deposit_pct}%)</span><span className="num">{money(t.depositWithVat, ws.currency, true)}</span></div>}
      </div>
      <div className="sub small col g6"><p className="eyebrow">What happens when you accept</p>
        <p>You&apos;ll get the project agreement to sign{q.deposit_pct > 0 ? ` and the ${q.deposit_pct}% deposit invoice` : ''} straight away in your portal. Work starts once both are done.</p>
      </div>
      {q.status === 'accepted' && <p className="muted xs">Accepted by {q.accepted_name}{q.decided_at ? ` on ${dateY(q.decided_at)}` : ''}.</p>}
      {q.status === 'declined' && <p className="muted xs">Declined{q.decided_at ? ` on ${dateY(q.decided_at)}` : ''}{q.decline_reason ? `: “${q.decline_reason}”` : ''}.</p>}
    </article>
  );
}
