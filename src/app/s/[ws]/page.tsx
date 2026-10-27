import Link from 'next/link';
import { requireMember } from '@/lib/auth';
import { Avatar, Card, Chip, PageHead } from '@/components/ui';
import { Icon } from '@/components/Icon';
import { totalsFor } from '@/lib/data';
import { date, dateY, relDue, shortMoney, today, when, weekday } from '@/lib/format';
import type { Activity, Contact, Invoice, Project } from '@/lib/types';

export const metadata = { title: 'Overview' };

export default async function Dashboard({ params }: { params: Promise<{ ws: string }> }) {
  const { ws: slug } = await params;
  const { supabase, ws, name } = await requireMember(slug);
  const b = `/s/${slug}`;
  const monthStart = today().slice(0, 8) + '01';
  const [{ data: invoices }, { data: projects }, { data: leads }, { data: contracts }, { data: unread }, { data: activity }, { data: payments }] = await Promise.all([
    supabase.from('invoices').select('*, contacts(name)').eq('workspace_id', ws.id).in('status', ['sent', 'processing']),
    supabase.from('projects').select('*, contacts(name, company)').eq('workspace_id', ws.id).eq('status', 'active').order('due_date'),
    supabase.from('leads').select('*, contacts(name, company)').eq('workspace_id', ws.id).in('stage', ['new', 'call', 'proposal']),
    supabase.from('contracts').select('*, contacts(name)').eq('workspace_id', ws.id).in('status', ['sent', 'changes']),
    supabase.from('messages').select('contact_id, body, created_at, contacts(name)').eq('workspace_id', ws.id).eq('from_client', true).is('read_by_studio_at', null).order('created_at', { ascending: false }),
    supabase.from('activity').select('*').eq('workspace_id', ws.id).order('created_at', { ascending: false }).limit(10),
    supabase.from('payments').select('amount').eq('workspace_id', ws.id).eq('status', 'success').gte('paid_at', monthStart),
  ]);
  const inv = (invoices || []) as (Invoice & { contacts: Contact })[];
  const tot = await totalsFor(supabase, inv.map((i) => i.id));
  const outstanding = inv.reduce((s, i) => s + tot[i.id].total - tot[i.id].paid, 0);
  const overdue = inv.filter((i) => i.status === 'sent' && i.due_on < today());
  const paidMonth = (payments || []).reduce((s, p) => s + Number(p.amount), 0);
  const pipeline = (leads || []).reduce((s, l) => s + Number(l.value), 0);

  type Att = [tone: 'urgent' | 'info' | 'warn' | '', icon: string, title: string, sub: string, href: string, label: string];
  const att: Att[] = [];
  overdue.forEach((i) => att.push(['urgent', 'receipt', `${i.number} is ${relDue(i.due_on)}`, `${i.contacts.name} · ${shortMoney(tot[i.id].total - tot[i.id].paid, ws.currency)}`, `${b}/invoices/${i.id}`, 'Overdue']));
  inv.filter((i) => i.status === 'processing').forEach((i) => att.push(['info', 'bank', `Confirm the transfer for ${i.number}`, `${i.contacts.name} says it's sent`, `${b}/invoices/${i.id}`, 'Check']));
  (contracts || []).forEach((k) => att.push(k.status === 'changes' ? ['info', 'sign', `Changes requested on ${k.title}`, (k.contacts as Contact).name, `${b}/contracts/${k.id}`, 'Revise'] : ['warn', 'sign', `${k.title} not signed yet`, `${(k.contacts as Contact).name} · sent ${date(k.sent_at)}`, `${b}/contracts/${k.id}`, 'Waiting']));
  const seen = new Set<string>();
  (unread || []).forEach((m) => { if (seen.has(m.contact_id)) return; seen.add(m.contact_id); att.push(['', 'chat', `Message from ${(m.contacts as unknown as Contact).name}`, m.body.slice(0, 70), `${b}/inbox/${m.contact_id}`, '']); });
  (leads || []).filter((l) => l.stage === 'new').forEach((l) => att.push(['', 'users', `New lead: ${(l.contacts as Contact).company || (l.contacts as Contact).name}`, `${l.service} · ${shortMoney(Number(l.value), ws.currency)} · ${l.source}`, `${b}/leads/${l.id}`, '']));

  const hour = new Date().toLocaleString('en-GB', { hour: 'numeric', hour12: false, timeZone: 'Africa/Lagos' });
  const greet = Number(hour) < 12 ? 'Good morning' : Number(hour) < 17 ? 'Good afternoon' : 'Good evening';
  const isEmpty = !(projects || []).length && !(leads || []).length;

  return (
    <div className="page">
      <PageHead eyebrow={`${weekday(today())} ${dateY(today())}`} title={`${greet}, ${name.split(' ')[0]}`} />
      {isEmpty && (
        <Card title="Get set up" icon="check">
          <div className="rows">
            {[['Add your business details and brand colour', `${b}/settings`, 'gear'], ['Connect your bank for card payments', `${b}/settings?tab=payments`, 'bank'], ['Add your first client', `${b}/contacts?new=1`, 'user'], ['Create a project and invite them to the portal', `${b}/projects?new=1`, 'folder']].map(([t, h, i], k) => (
              <Link key={h} className="lrow" href={h}><span className="ftype"><Icon name={i} /></span><span className="grow"><b>{k + 1}. {t}</b></span><Icon name="right" size={14} /></Link>
            ))}
          </div>
        </Card>
      )}
      <div className="g4">
        <Link className="card stat" href={`${b}/invoices`}><span className="eyebrow">Outstanding</span><span className="v">{shortMoney(outstanding, ws.currency)}</span><span className="muted small">{inv.length} invoices · {overdue.length} overdue</span></Link>
        <Link className="card stat" href={`${b}/invoices?f=paid`}><span className="eyebrow">Paid this month</span><span className="v">{shortMoney(paidMonth, ws.currency)}</span><span className="muted small">Card, transfer and recorded payments</span></Link>
        <Link className="card stat" href={`${b}/projects`}><span className="eyebrow">Active projects</span><span className="v">{(projects || []).length}</span><span className="muted small">{(projects || []).filter((p) => p.due_date && p.due_date <= today().slice(0, 8) + '31').length} due this month</span></Link>
        <Link className="card stat" href={`${b}/leads`}><span className="eyebrow">Open pipeline</span><span className="v">{shortMoney(pipeline, ws.currency)}</span><span className="muted small">{(leads || []).length} leads</span></Link>
      </div>
      <div className="split">
        <div className="stack">
          <Card title="Needs attention" icon="alert" extra={<Chip>{att.length}</Chip>}>
            {att.length ? <div className="rows">{att.slice(0, 8).map(([tone, icon, t, sub, href, label], i) => (
              <Link key={i} className="lrow" href={href}><span className="ftype" style={{ color: tone ? `var(--${tone})` : undefined }}><Icon name={icon} /></span><div className="grow"><b>{t}</b><p>{sub}</p></div>{label && <Chip tone={tone || ''}>{label}</Chip>}<Icon name="right" size={14} /></Link>
            ))}</div> : <p className="muted small">Nothing needs you right now.</p>}
          </Card>
          <Card title="Projects" icon="folder" extra={<Link className="link" href={`${b}/projects`}>All projects</Link>}>
            {(projects || []).length ? <div className="rows">{(projects as (Project & { contacts: Contact })[]).map((p) => (
              <Link key={p.id} className="lrow" href={`${b}/projects/${p.id}`}><Avatar name={p.contacts.name} size="sm" /><div className="grow"><b>{p.name}</b><p>{p.contacts.name} · {p.stages[p.stage] || 'Complete'}</p></div><span className="muted small num">{date(p.due_date)}</span></Link>
            ))}</div> : <p className="muted small">No active projects. <Link href={`${b}/projects?new=1`}>Create one</Link>.</p>}
          </Card>
        </div>
        <div className="stack">
          <Card title="Activity" icon="clock">
            <div className="timeline">{((activity || []) as Activity[]).map((a) => (
              <div key={a.id} className={`tl${a.from_client ? '' : ' muted'}`}><i /><div><b style={{ fontWeight: 500 }}>{a.actor_name}</b> {a.message}<small>{when(a.created_at)}</small></div></div>
            ))}{!(activity || []).length && <p className="muted small">Activity shows up here as you and your clients work.</p>}</div>
          </Card>
        </div>
      </div>
    </div>
  );
}
