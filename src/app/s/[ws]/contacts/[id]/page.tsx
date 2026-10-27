import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireMember } from '@/lib/auth';
import { Avatar, Card, Chip, Crumbs, Field, Hidden, Notice, contractChip, invoiceChip } from '@/components/ui';
import { CopyButton, Submit } from '@/components/client';
import { Icon } from '@/components/Icon';
import { inviteToPortal, updateContact } from '../../actions';
import { totalsFor } from '@/lib/data';
import { date, dateY, money, shortMoney, when } from '@/lib/format';
import type { Contact, Contract, Invoice, Project } from '@/lib/types';

export default async function ContactPage({ params, searchParams }: { params: Promise<{ ws: string; id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { ws: slug, id } = await params; const sp = await searchParams;
  const { supabase, ws } = await requireMember(slug);
  const { data: c } = await supabase.from('contacts').select('*').eq('id', id).eq('workspace_id', ws.id).maybeSingle();
  if (!c) notFound();
  const contact = c as Contact;
  const [{ data: projects }, { data: invoices }, { data: contracts }] = await Promise.all([
    supabase.from('projects').select('*').eq('contact_id', id).order('created_at', { ascending: false }),
    supabase.from('invoices').select('*').eq('contact_id', id).order('created_at', { ascending: false }),
    supabase.from('contracts').select('*').eq('contact_id', id).order('created_at', { ascending: false }),
  ]);
  const inv = (invoices || []) as Invoice[];
  const tot = await totalsFor(supabase, inv.map((i) => i.id));
  const paid = inv.reduce((s, i) => s + tot[i.id].paid, 0);
  const owing = inv.filter((i) => ['sent', 'processing'].includes(i.status)).reduce((s, i) => s + tot[i.id].total - tot[i.id].paid, 0);
  const b = `/s/${slug}`;
  return (
    <div className="page">
      <Crumbs items={[['Contacts', `${b}/contacts`], [contact.name]]} />
      <div className="phead">
        <div className="row"><Avatar name={contact.name} size="lg" /><div className="col g6"><p className="eyebrow">{contact.type} since {dateY(contact.created_at)}</p><h1>{contact.name}</h1><p className="muted small">{[contact.role, contact.company].filter(Boolean).join(' · ')}</p></div></div>
        <div className="acts">
          <Link className="btn" href={`${b}/inbox/${id}`}><Icon name="chat" />Message</Link>
          <form action={inviteToPortal}><Hidden v={{ ws: slug, id }} /><Submit className={contact.portal_status === 'active' ? 'btn' : 'btn primary'} pending="Sending…">{contact.portal_status === 'none' ? 'Invite to portal' : contact.portal_status === 'invited' ? 'Resend portal invite' : 'Send a sign-in link'}</Submit></form>
        </div>
      </div>
      {sp.invite && <Notice tone="info" icon="link"><div className="col g8"><span>Share this one-time sign-in link with {contact.name}. It expires in 24 hours.</span><span className="mono xs" style={{ wordBreak: 'break-all' }}>{sp.invite}</span><CopyButton text={sp.invite} label="Copy link" /></div></Notice>}
      <div className="split rev">
        <form className="card" action={updateContact}>
          <Hidden v={{ ws: slug, id }} />
          <div className="chead"><span className="t"><Icon name="user" />Details</span></div>
          <div className="fields">
            <Field label="Name"><input className="inp" name="name" id="cd-name" defaultValue={contact.name} required /></Field>
            <Field label="Company" optional><input className="inp" name="company" id="cd-company" defaultValue={contact.company || ''} /></Field>
            <Field label="Role" optional><input className="inp" name="role" id="cd-role" defaultValue={contact.role || ''} /></Field>
            <Field label="Type"><select className="sel" name="type" id="cd-type" defaultValue={contact.type}><option value="client">Client</option><option value="lead">Lead</option><option value="collaborator">Collaborator</option></select></Field>
            <Field label="Email" hint="Their portal sign-in"><input className="inp" name="email" id="cd-email" type="email" defaultValue={contact.email || ''} /></Field>
            <Field label="Phone" optional><input className="inp" name="phone" id="cd-phone" defaultValue={contact.phone || ''} /></Field>
            <Field label="City" optional><input className="inp" name="city" id="cd-city" defaultValue={contact.city || ''} /></Field>
            <Field label="Tags" hint="Comma separated"><input className="inp" name="tags" id="cd-tags" defaultValue={contact.tags.join(', ')} /></Field>
          </div>
          <Field label="Internal notes" hint="Only your team sees these"><textarea className="ta" name="notes" id="cd-notes" defaultValue={contact.notes} /></Field>
          <div className="setrow"><div className="grow"><b>Client portal</b><p>{contact.portal_status === 'active' ? `Active · last seen ${when(contact.last_seen_at) || 'recently'}` : contact.portal_status === 'invited' ? `Invited ${date(contact.portal_invited_at)}, not signed in yet` : 'Not invited'}</p></div>{contact.portal_status === 'active' ? <Chip tone="good">Active</Chip> : contact.portal_status === 'invited' ? <Chip tone="warn">Invited</Chip> : <Chip>Off</Chip>}</div>
          <div className="row"><span className="sp" /><Submit pending="Saving…">Save</Submit></div>
        </form>
        <div className="stack">
          <div className="g3"><div className="card stat"><span className="eyebrow">Paid to date</span><span className="v">{shortMoney(paid, ws.currency)}</span></div><div className="card stat"><span className="eyebrow">Outstanding</span><span className="v">{shortMoney(owing, ws.currency)}</span></div><div className="card stat"><span className="eyebrow">Projects</span><span className="v">{(projects || []).length}</span></div></div>
          <Card title="Projects" icon="folder" extra={<Link className="btn" href={`${b}/projects?new=1&contact=${id}`}><Icon name="plus" />New</Link>}>
            {(projects || []).length ? <div className="rows">{(projects as Project[]).map((p) => <Link key={p.id} className="lrow" href={`${b}/projects/${p.id}`}><div className="grow"><b>{p.name}</b><p>{p.code} · {p.status === 'completed' ? 'Completed' : p.stages[p.stage]}</p></div><span className="muted small">{money(p.value, ws.currency)}</span></Link>)}</div> : <p className="muted small">No projects yet.</p>}
          </Card>
          <Card title="Invoices" icon="receipt">
            {inv.length ? <div className="rows">{inv.map((i) => <Link key={i.id} className="lrow" href={`${b}/invoices/${i.id}`}><span className="ftype">{i.number.slice(-4)}</span><div className="grow"><b>{i.title}</b><p>{i.issued_on ? 'Issued ' + date(i.issued_on) : 'Draft'}</p></div>{invoiceChip(i.status, tot[i.id].is_overdue, i.due_on)}<span className="amt">{money(tot[i.id].total, ws.currency)}</span></Link>)}</div> : <p className="muted small">No invoices yet.</p>}
          </Card>
          <Card title="Contracts" icon="sign">
            {(contracts || []).length ? <div className="rows">{(contracts as Contract[]).map((k) => <Link key={k.id} className="lrow" href={`${b}/contracts/${k.id}`}><div className="grow"><b>{k.title}</b><p>{k.number}</p></div>{contractChip(k.status)}</Link>)}</div> : <p className="muted small">No contracts yet.</p>}
          </Card>
        </div>
      </div>
    </div>
  );
}
