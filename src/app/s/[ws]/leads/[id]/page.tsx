import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireMember } from '@/lib/auth';
import { Avatar, Card, Crumbs, Field, Hidden } from '@/components/ui';
import { Submit } from '@/components/client';
import { Icon } from '@/components/Icon';
import { convertLead, updateLead } from '../../actions';
import { createProposal } from '../../more-actions';
import { LEAD_STAGES } from '@/lib/plans';
import { addDays, date, money, today, when } from '@/lib/format';
import type { Contact, Lead, Message } from '@/lib/types';

export default async function LeadPage({ params, searchParams }: { params: Promise<{ ws: string; id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { ws: slug, id } = await params; const sp = await searchParams;
  const { supabase, ws } = await requireMember(slug);
  const { data } = await supabase.from('leads').select('*, contacts(*)').eq('id', id).eq('workspace_id', ws.id).maybeSingle();
  if (!data) notFound();
  const l = data as Lead & { contacts: Contact }; const c = l.contacts;
  const { data: msgs } = await supabase.from('messages').select('*').eq('contact_id', c.id).order('created_at').limit(20);
  const b = `/s/${slug}`;
  const deposit = Math.round(Number(l.value) * 0.4);
  return (
    <div className="page">
      <Crumbs items={[['Leads', `${b}/leads`], [c.company || c.name]]} />
      <div className="phead">
        <div className="col g6"><p className="eyebrow">{l.service} · added {date(l.created_at)} · {l.source}</p><h1>{c.company || c.name}</h1></div>
        <div className="acts">
          <form action={updateLead} className="row"><Hidden v={{ ws: slug, id }} /><select className="sel" name="stage" id="ld-stage" defaultValue={l.stage} style={{ width: 'auto' }}>{LEAD_STAGES.map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select><Submit className="btn" pending="…">Move</Submit></form>
          {!l.project_id && <form action={createProposal}><Hidden v={{ ws: slug, lead_id: id }} /><Submit className="btn" pending="Drafting…"><Icon name="quote" />Write a proposal</Submit></form>}
          {l.project_id ? <Link className="btn primary" href={`${b}/projects/${l.project_id}`}>Open project</Link> : <Link className="btn primary" href={`?convert=1`}><Icon name="check" />Convert to project</Link>}
        </div>
      </div>
      {sp.convert && !l.project_id && (
        <form className="card" action={convertLead}>
          <Hidden v={{ ws: slug, id }} />
          <div className="chead"><span className="t"><Icon name="folder" />Convert to project</span><Link className="ibtn sm" href="?" aria-label="Close"><Icon name="x" /></Link></div>
          <div className="fields three">
            <Field label="Project name"><input className="inp" name="project_name" id="cv-name" defaultValue={`${c.company || c.name} ${l.service.toLowerCase()}`} required /></Field>
            <Field label="Start"><input className="inp" type="date" name="start" id="cv-start" defaultValue={today()} /></Field>
            <Field label="Handoff"><input className="inp" type="date" name="due" id="cv-due" defaultValue={addDays(today(), 28)} /></Field>
          </div>
          <label className="setrow"><div className="grow"><b>Draft the contract</b><p>From your first contract template, with the client and project filled in</p></div><span className="switch-native"><input type="checkbox" name="contract" defaultChecked /><span className="tog" /></span></label>
          <label className="setrow"><div className="grow"><b>Draft a deposit invoice</b><p>40% of {money(l.value, ws.currency)} = {money(deposit, ws.currency)}</p></div><span className="switch-native"><input type="checkbox" name="invoice" defaultChecked={Number(l.value) > 0} /><span className="tog" /></span></label>
          <label className="setrow"><div className="grow"><b>Invite to the client portal</b><p>{c.email || 'Add an email to the contact first'}</p></div><span className="switch-native"><input type="checkbox" name="invite" defaultChecked={!!c.email} disabled={!c.email} /><span className="tog" /></span></label>
          <div className="row"><span className="sp" /><Submit pending="Creating…">Create project</Submit></div>
        </form>
      )}
      <div className="split">
        <form className="card" action={updateLead}>
          <Hidden v={{ ws: slug, id }} />
          <div className="row"><Avatar name={c.name} size="lg" /><div className="grow"><h2>{c.name}</h2><p className="muted small">{[c.role, c.email, c.phone].filter(Boolean).join(' · ')}</p></div><Link className="btn" href={`${b}/contacts/${c.id}`}>Contact</Link></div>
          <div className="fields three">
            <Field label="Service"><input className="inp" name="service" id="ld-service" defaultValue={l.service} /></Field>
            <Field label={`Value (${ws.currency})`}><input className="inp" type="number" name="value" id="ld-value" min="0" step="1000" defaultValue={Number(l.value)} /></Field>
            <Field label="Source"><input className="inp" name="source" id="ld-source" defaultValue={l.source} /></Field>
          </div>
          <Field label="Next step"><input className="inp" name="next_step" id="ld-next" defaultValue={l.next_step} /></Field>
          <Field label="Notes"><textarea className="ta" name="notes" id="ld-notes" defaultValue={l.notes} placeholder="Budget, timing, who decides" /></Field>
          <div className="row"><span className="sp" /><Submit pending="Saving…">Save</Submit></div>
        </form>
        <Card title="Conversation" icon="chat" extra={<Link className="link" href={`${b}/inbox/${c.id}`}>Open in inbox</Link>}>
          {(msgs || []).length ? <div className="thread" style={{ maxHeight: 320 }}>{(msgs as Message[]).map((m) => <div key={m.id} className={`msg${m.from_client ? '' : ' me'}`}><p>{m.body}</p><small>{when(m.created_at)}</small></div>)}</div> : <p className="muted small">No messages yet.</p>}
        </Card>
      </div>
    </div>
  );
}
