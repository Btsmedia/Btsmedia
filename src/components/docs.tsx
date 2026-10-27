import { invoiceChip, contractChip } from './ui';
import { dateY, money } from '@/lib/format';
import type { Contact, Contract, Invoice, InvoiceItem, Project, Totals, Workspace } from '@/lib/types';

export function StudioMark({ ws }: { ws: Pick<Workspace, 'name' | 'brand_color' | 'logo_path'> }) {
  if (ws.logo_path) return <img className="studio-logo" src={ws.logo_path} alt={ws.name} />;
  return <span className="logo" style={{ boxShadow: 'none', background: ws.brand_color, color: '#fff' }}><span style={{ borderColor: '#fff' }}><b>{ws.name[0]}</b></span></span>;
}

export function InvoiceDoc({ ws, inv, items, totals, contact, project }: { ws: Workspace; inv: Invoice; items: InvoiceItem[]; totals: Totals; contact: Contact; project?: Project | null }) {
  const balance = totals.total - totals.paid;
  return (
    <article className="doc">
      <div className="dhead">
        <div className="col g8"><StudioMark ws={ws} /><div className="small"><b>{ws.legal_name || ws.name}</b>{ws.address && <p className="muted">{ws.address}</p>}{(ws.company_number || ws.tax_id) && <p className="muted">{[ws.company_number, ws.tax_id && 'TIN ' + ws.tax_id].filter(Boolean).join(' · ')}</p>}</div></div>
        <div className="col g6" style={{ textAlign: 'right' }}><p className="eyebrow">Invoice</p><p className="mono">{inv.number}</p><p className="big">{money(totals.total, ws.currency)}</p><div>{invoiceChip(inv.status, totals.is_overdue, inv.due_on)}</div></div>
      </div>
      <div className="parties">
        <div><p className="eyebrow">Billed to</p><p><b>{contact.company || contact.name}</b></p><p>{contact.name}</p><p>{contact.email}</p></div>
        <div><p className="eyebrow">Dates</p><p>Issued {inv.issued_on ? dateY(inv.issued_on) : 'not yet'}</p><p>Due {dateY(inv.due_on)}</p>{inv.paid_on && <p>Paid {dateY(inv.paid_on)}</p>}</div>
        <div><p className="eyebrow">{project ? 'Project' : 'For'}</p><p>{project?.name || inv.title}</p>{project && <p className="mono">{project.code}</p>}</div>
      </div>
      <div className="tblwrap"><table className="items" style={{ minWidth: 460 }}><thead><tr><th>Description</th><th className="r">Qty</th><th className="r">Rate</th><th className="r">Amount</th></tr></thead><tbody>
        {items.map((it, i) => <tr key={i}><td>{it.description}</td><td className="r">{Number(it.qty)}</td><td className="r">{money(it.rate, ws.currency)}</td><td className="r">{money(Number(it.qty) * Number(it.rate), ws.currency)}</td></tr>)}
      </tbody></table></div>
      <div className="totals">
        <div><span className="muted">Subtotal</span><span className="num">{money(totals.subtotal, ws.currency, true)}</span></div>
        {inv.vat && <div><span className="muted">VAT {Number(ws.vat_rate)}%</span><span className="num">{money(totals.vat_amount, ws.currency, true)}</span></div>}
        <div className="grand"><span>Total</span><span className="num">{money(totals.total, ws.currency, true)}</span></div>
        <div><span className="muted">Paid</span><span className="num">{money(totals.paid, ws.currency, true)}</span></div>
        <div className="b"><span>Balance</span><span className="num">{money(Math.max(0, balance), ws.currency, true)}</span></div>
      </div>
      {inv.notes && <p className="small ink2" style={{ whiteSpace: 'pre-line' }}>{inv.notes}</p>}
      {(ws.bank_account_number || ws.pass_card_fees) && (
        <div className="sub small col g6"><p className="eyebrow">How to pay</p>
          <p>Card or bank transfer from the client portal.{ws.bank_account_number && <> Bank transfer: {ws.bank_name} · {ws.bank_account_name} · <span className="mono">{ws.bank_account_number}</span> · reference <span className="mono">{inv.number}</span>.</>}</p>
          {inv.pass_fees && ws.pass_card_fees && <p className="muted">Card payments add a {Number(ws.card_fee_pct)}% processing fee.</p>}
        </div>
      )}
    </article>
  );
}

export function ContractDoc({ ws, k, contact, forClient }: { ws: Workspace; k: Contract; contact: Contact; forClient?: boolean }) {
  return (
    <article className="doc">
      <div className="dhead"><div className="col g6"><p className="eyebrow">{k.number}</p><h1>{k.title}</h1><p className="muted small">Between {ws.legal_name || ws.name} and {contact.company || contact.name}</p></div>{contractChip(k.status, forClient)}</div>
      <div className="legal">{k.body.map((s, i) => <div key={i}><h3>{i + 1}. {s.heading}</h3><p style={{ whiteSpace: 'pre-line' }}>{s.body}</p></div>)}</div>
      <div className="sigblock">
        <div className="sigbox"><span className="eyebrow">For {ws.legal_name || ws.name}</span><span className="sig">{k.studio_signer_name || ''}</span><span className="muted xs">{k.studio_signed_at ? `${k.studio_signer_name} · ${dateY(k.studio_signed_at)}` : 'Not signed yet'}</span></div>
        <div className="sigbox"><span className="eyebrow">For {contact.company || contact.name}</span>
          {k.client_signature_kind === 'drawn' && k.client_signature ? <img className="sig-img" src={k.client_signature} alt={`Signature of ${k.client_signer_name}`} /> : <span className="sig">{k.client_signer_name || ''}</span>}
          <span className="muted xs">{k.client_signed_at ? `${k.client_signer_name} · ${dateY(k.client_signed_at)}` : 'Awaiting signature'}</span></div>
      </div>
      {k.doc_hash && <p className="muted xs mono" style={{ wordBreak: 'break-all' }}>Document fingerprint (SHA-256): {k.doc_hash}</p>}
    </article>
  );
}
