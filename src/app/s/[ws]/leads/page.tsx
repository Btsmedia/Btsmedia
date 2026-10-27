import Link from 'next/link';
import { requireMember } from '@/lib/auth';
import { Chip, Field, Hidden, PageHead } from '@/components/ui';
import { Submit } from '@/components/client';
import { Icon } from '@/components/Icon';
import { createLead, updateLead } from '../actions';
import { LEAD_STAGES } from '@/lib/plans';
import { date, money } from '@/lib/format';
import type { Contact, Lead } from '@/lib/types';

export const metadata = { title: 'Leads' };
const SOURCES = ['Referral', 'Instagram', 'Website', 'Booking page', 'Event', 'LinkedIn', 'Other'];

export default async function Leads({ params, searchParams }: { params: Promise<{ ws: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { ws: slug } = await params; const sp = await searchParams;
  const { supabase, ws } = await requireMember(slug);
  const [{ data }, { data: contacts }] = await Promise.all([
    supabase.from('leads').select('*, contacts(*)').eq('workspace_id', ws.id).order('created_at', { ascending: false }),
    supabase.from('contacts').select('id, name, company').eq('workspace_id', ws.id).order('name'),
  ]);
  const leads = (data || []) as (Lead & { contacts: Contact })[];
  const b = `/s/${slug}/leads`;
  const open = leads.filter((l) => ['new', 'call', 'proposal'].includes(l.stage)).reduce((s, l) => s + Number(l.value), 0);
  const idx = (k: string) => LEAD_STAGES.findIndex(([s]) => s === k);
  return (
    <div className="page">
      <PageHead eyebrow={`Pipeline · ${money(open, ws.currency)} open`} title="Leads" actions={<Link className="btn primary" href={`${b}?new=1`}><Icon name="plus" />New lead</Link>} />
      {sp.new && (
        <form className="card" action={createLead}>
          <Hidden v={{ ws: slug }} />
          <div className="chead"><span className="t"><Icon name="users" />New lead</span><Link className="ibtn sm" href={b} aria-label="Close"><Icon name="x" /></Link></div>
          <Field label="Existing contact" hint="Or leave this and fill in a new person below"><select className="sel" name="contact_id" id="l-contact" defaultValue=""><option value="">New person…</option>{(contacts || []).map((c) => <option key={c.id} value={c.id}>{c.name}{c.company ? ` · ${c.company}` : ''}</option>)}</select></Field>
          <div className="fields three">
            <Field label="Name"><input className="inp" name="name" id="l-name" /></Field>
            <Field label="Company" optional><input className="inp" name="company" id="l-company" /></Field>
            <Field label="Email" optional><input className="inp" name="email" id="l-email" type="email" /></Field>
            <Field label="What they need"><input className="inp" name="service" id="l-service" defaultValue="Brand identity" /></Field>
            <Field label={`Estimated value (${ws.currency})`}><input className="inp" name="value" id="l-value" type="number" min="0" step="1000" defaultValue="0" /></Field>
            <Field label="Source"><select className="sel" name="source" id="l-source">{SOURCES.map((x) => <option key={x}>{x}</option>)}</select></Field>
          </div>
          <Field label="Next step" optional><input className="inp" name="next_step" id="l-next" placeholder="e.g. Book a discovery call" /></Field>
          <div className="row"><span className="sp" /><Submit pending="Adding…">Add lead</Submit></div>
        </form>
      )}
      <div className="board">
        {LEAD_STAGES.map(([key, label], si) => {
          const col = leads.filter((l) => l.stage === key);
          return (
            <section key={key} className="card kcol">
              <div className="chead"><span className="t">{label}</span><Chip>{col.length}</Chip></div>
              <p className="muted xs num" style={{ marginTop: -8 }}>{money(col.reduce((s, l) => s + Number(l.value), 0), ws.currency)}</p>
              {col.map((l) => (
                <div key={l.id} className="lead">
                  <Link href={`${b}/${l.id}`} style={{ textDecoration: 'none', color: 'inherit', display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <b>{l.contacts.company || l.contacts.name}</b><span>{l.service}</span>
                    <span className="meta"><span>{l.source} · {date(l.created_at)}</span><span className="num">{money(l.value, ws.currency)}</span></span>
                    {l.next_step && <span className="muted xs">{l.next_step}</span>}
                  </Link>
                  <div className="kmove">
                    {si > 0 && si < 3 && <form action={updateLead}><Hidden v={{ ws: slug, id: l.id, stage: LEAD_STAGES[si - 1][0], return: b }} /><button>Back</button></form>}
                    {si < 2 && <form action={updateLead}><Hidden v={{ ws: slug, id: l.id, stage: LEAD_STAGES[si + 1][0], return: b }} /><button className="go">Move to {LEAD_STAGES[si + 1][1]}</button></form>}
                    {si === 2 && <Link className="btn primary" style={{ padding: '4px 10px', fontSize: '.72rem' }} href={`${b}/${l.id}?convert=1`}>Won · convert</Link>}
                    {key === 'lost' && <form action={updateLead}><Hidden v={{ ws: slug, id: l.id, stage: 'new', return: b }} /><button>Reopen</button></form>}
                  </div>
                </div>
              ))}
              {!col.length && <p className="muted xs">{idx(key) === 0 ? 'New enquiries land here.' : 'Nothing here.'}</p>}
            </section>
          );
        })}
      </div>
    </div>
  );
}
