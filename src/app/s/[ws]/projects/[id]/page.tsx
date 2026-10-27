import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireMember } from '@/lib/auth';
import { Avatar, Card, Chip, Crumbs, Empty, Field, Hidden, Steps, Tabs, contractChip, invoiceChip } from '@/components/ui';
import { ConfirmSubmit, Submit } from '@/components/client';
import { FileUpload } from '@/components/FileUpload';
import { Icon } from '@/components/Icon';
import { addNote, createContract, createInvoice, moveStage, updateFile, updateNote, updateProject, updateTask, addTask } from '../../actions';
import { totalsFor } from '@/lib/data';
import { date, fileSize, money, when } from '@/lib/format';
import type { Activity, Contact, Contract, FileRow, Gallery, Invoice, Note, Project, Task } from '@/lib/types';
import { createGallery } from '../../more-actions';

export default async function ProjectPage({ params, searchParams }: { params: Promise<{ ws: string; id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { ws: slug, id } = await params; const sp = await searchParams;
  const { supabase, ws } = await requireMember(slug);
  const { data } = await supabase.from('projects').select('*, contacts(*)').eq('id', id).eq('workspace_id', ws.id).maybeSingle();
  if (!data) notFound();
  const p = data as Project & { contacts: Contact }; const c = p.contacts;
  const tab = sp.tab || 'overview';
  const [{ data: tasks }, { data: notes }, { data: files }, { data: invoices }, { data: contracts }, { data: templates }, { data: activity }] = await Promise.all([
    supabase.from('tasks').select('*').eq('project_id', id).order('position'),
    supabase.from('notes').select('*').eq('project_id', id).order('created_at', { ascending: false }),
    supabase.from('files').select('*').eq('project_id', id).order('created_at', { ascending: false }),
    supabase.from('invoices').select('*').eq('project_id', id).order('created_at'),
    supabase.from('contracts').select('*').eq('project_id', id).order('created_at'),
    supabase.from('contract_templates').select('id, name').eq('workspace_id', ws.id).order('created_at'),
    supabase.from('activity').select('*').eq('workspace_id', ws.id).eq('entity_id', id).order('created_at', { ascending: false }).limit(30),
  ]);
  const { data: gals } = await supabase.from('galleries').select('*, gallery_items(status)').eq('project_id', id).order('created_at', { ascending: false });
  const G = (gals || []) as (Gallery & { gallery_items: { status: string }[] })[];
  const T = (tasks || []) as Task[], N = (notes || []) as Note[], F = (files || []) as FileRow[], I = (invoices || []) as Invoice[], K = (contracts || []) as Contract[];
  const tot = await totalsFor(supabase, I.map((i) => i.id));
  const paid = I.reduce((s, i) => s + tot[i.id].paid, 0);
  const b = `/s/${slug}`, here = `${b}/projects/${id}`;
  const h = { ws: slug, project_id: id };

  let body: React.ReactNode = null;
  if (tab === 'overview') body = (
    <div className="split">
      <div className="stack">
        <Card title="Stage" icon="flow" extra={p.status === 'completed' ? <Chip tone="good">Completed</Chip> : <>
          <form action={moveStage}><Hidden v={{ ws: slug, id, dir: -1 }} /><Submit className="btn" pending="…" disabled={p.stage === 0}><Icon name="left" />Back</Submit></form>
          <form action={moveStage}><Hidden v={{ ws: slug, id, dir: 1 }} /><Submit pending="Moving…">{p.stage >= p.stages.length - 1 ? 'Mark complete' : `Move to ${p.stages[p.stage + 1]}`}</Submit></form></>}>
          <Steps stages={p.stages} stage={p.stage} />
          <p className="muted xs">Clients see the current stage on their portal.</p>
        </Card>
        <form className="card" action={updateProject}>
          <Hidden v={{ ws: slug, id }} />
          <div className="chead"><span className="t"><Icon name="edit" />Details</span></div>
          <div className="fields"><Field label="Name"><input className="inp" name="name" id="pr-name" defaultValue={p.name} /></Field><Field label="Service"><input className="inp" name="service" id="pr-service" defaultValue={p.service} /></Field></div>
          <Field label="Summary" hint="Shown to the client and used in contracts as {{project.summary}}"><textarea className="ta" name="summary" id="pr-sum" defaultValue={p.summary} /></Field>
          <div className="fields three">
            <Field label="Start"><input className="inp" type="date" name="start_date" id="pr-start" defaultValue={p.start_date} /></Field>
            <Field label="Handoff"><input className="inp" type="date" name="due_date" id="pr-due" defaultValue={p.due_date || ''} /></Field>
            <Field label={`Value (${ws.currency})`}><input className="inp" type="number" min="0" step="1000" name="value" id="pr-val" defaultValue={Number(p.value)} /></Field>
          </div>
          <Field label="Stages" hint="Comma separated, in order"><input className="inp" name="stages" id="pr-stages" defaultValue={p.stages.join(', ')} /></Field>
          <label className="setrow"><div className="grow"><b>Show the task list to the client</b><p>Only tasks marked visible appear</p></div><span className="switch-native"><input type="checkbox" name="show_plan" defaultChecked={p.show_plan} /><span className="tog" /></span></label>
          <div className="row"><span className="sp" /><Submit pending="Saving…">Save</Submit></div>
        </form>
      </div>
      <div className="stack">
        <Card title="Money" icon="receipt">
          <div className="sub col g8"><div className="row" style={{ alignItems: 'flex-end' }}><span className="light num" style={{ fontSize: '1.6rem' }}>{money(paid, ws.currency)}</span><span className="sp" /><span className="muted small">of {money(p.value, ws.currency)}</span></div><div className="prog"><i style={{ width: `${p.value ? Math.min(100, (paid / Number(p.value)) * 100) : 0}%` }} /></div></div>
          <div className="rows">{I.map((i) => <Link key={i.id} className="lrow" href={`${b}/invoices/${i.id}`}><div className="grow"><b>{i.title}</b><p>{i.number}</p></div>{invoiceChip(i.status, tot[i.id].is_overdue, i.due_on)}</Link>)}</div>
        </Card>
        <Card title="Client" icon="user"><Link className="lrow" href={`${b}/contacts/${c.id}`}><Avatar name={c.name} size="sm" /><div className="grow"><b>{c.name}</b><p>{c.email || 'No email'} · portal {c.portal_status}</p></div></Link></Card>
      </div>
    </div>
  );

  if (tab === 'tasks') body = (
    <Card title="Tasks" icon="list" extra={<span className="muted small">{T.filter((t) => t.done).length} of {T.length} done · {p.show_plan ? 'visible tasks show in the portal' : 'task list hidden from client'}</span>}>
      <div className="rows">{T.map((t) => (
        <div key={t.id} className={`task${t.done ? ' done' : ''}`}>
          <form action={updateTask}><Hidden v={{ ...h, id: t.id, op: 'done' }} /><button className="cbx" style={{ background: t.done ? 'var(--pill)' : 'none', borderColor: t.done ? 'var(--pill)' : undefined, color: 'var(--pill-fg)' }} aria-label={t.done ? 'Mark not done' : 'Mark done'}>{t.done && <Icon name="check" size={12} className="" />}</button></form>
          <div className="grow" style={{ minWidth: 180 }}><p className="tt">{t.title}</p><p className="muted xs">{t.due_date ? 'Due ' + date(t.due_date) : 'No date'}{t.for_client ? ' · client task' : ''}</p></div>
          <form action={updateTask}><Hidden v={{ ...h, id: t.id, op: 'client' }} /><button className={`chip ${t.for_client ? 'ink' : 'line'}`} style={{ border: 0, cursor: 'pointer' }}>{t.for_client ? 'Client' : 'Studio'}</button></form>
          <form action={updateTask}><Hidden v={{ ...h, id: t.id, op: 'visible' }} /><button className="ibtn xs" aria-label={t.visible ? 'Visible to client' : 'Hidden from client'} title={t.visible ? 'Visible to client' : 'Hidden from client'}><Icon name={t.visible ? 'eye' : 'eyeoff'} /></button></form>
          <form action={updateTask}><Hidden v={{ ...h, id: t.id, op: 'delete' }} /><button className="ibtn xs" aria-label="Delete task"><Icon name="trash" /></button></form>
        </div>
      ))}</div>
      <form className="row wrap" action={addTask}><Hidden v={h} /><input className="inp" name="title" id="tk-title" placeholder="Add a task" style={{ flex: 1, minWidth: 200 }} /><input className="inp" type="date" name="due_date" id="tk-due" style={{ width: 'auto' }} /><label className="check"><input type="checkbox" name="for_client" /> Client task</label><Submit pending="Adding…">Add</Submit></form>
    </Card>
  );

  if (tab === 'files') body = (
    <div className="split">
      <Card title="Files" icon="folder">{F.length ? <div className="rows">{F.map((f) => (
        <div key={f.id} className="lrow"><span className="ftype">{f.name.split('.').pop()?.toUpperCase().slice(0, 4)}</span><div className="grow"><b>{f.name}</b><p>{f.by_client ? 'From client' : 'Studio'} · {date(f.created_at)} · {fileSize(f.size_bytes)}</p></div>
          <a className="btn" href={`/api/files/${f.id}`}><Icon name="download" />Download</a>
          <form action={updateFile}><Hidden v={{ ...h, id: f.id, op: 'share' }} /><button className={`chip ${f.shared ? 'good' : 'line'}`} style={{ border: 0, cursor: 'pointer' }}>{f.shared ? 'Client can see' : 'Studio only'}</button></form>
          <form action={updateFile}><Hidden v={{ ...h, id: f.id, op: 'delete' }} /><ConfirmSubmit className="ibtn xs" confirm="Delete?"><Icon name="trash" /></ConfirmSubmit></form>
        </div>))}</div> : <Empty icon="folder" title="No files yet" text="Upload briefs, artwork and deliverables." />}</Card>
      <Card title="Upload" icon="upload"><FileUpload projectId={id} studio /></Card>
    </div>
  );

  if (tab === 'proofing') body = (
    <div className="split">
      <Card title="Proofing galleries" icon="image" extra={<span className="muted small">Clients approve or comment on each image</span>}>
        {G.length ? <div className="rows">{G.map((g) => { const tot = g.gallery_items.length, ok = g.gallery_items.filter((i) => i.status === 'approved').length, ch = g.gallery_items.filter((i) => i.status === 'changes').length; return (
          <Link key={g.id} className="lrow" href={`${here}/galleries/${g.id}`}><span className="ftype"><Icon name="image" /></span><div className="grow"><b>{g.title}</b><p>{tot} image{tot === 1 ? '' : 's'} · {ok} approved{ch ? ` · ${ch} need changes` : ''}</p></div>
            {g.status === 'draft' ? <Chip tone="line">Draft</Chip> : g.status === 'approved' ? <Chip tone="good">Approved</Chip> : ch ? <Chip tone="warn">Changes asked</Chip> : <Chip tone="info">With client</Chip>}</Link>
        ); })}</div> : <Empty icon="image" title="No galleries yet" text={`Share concepts and finals with ${c.name.split(' ')[0]} for approval.`} />}
      </Card>
      <Card title="New gallery" icon="plus">
        <form action={createGallery} className="col g12"><Hidden v={h} />
          <Field label="Title"><input className="inp" name="title" id="gl-title" placeholder={`e.g. Logo concepts, round ${G.length + 1}`} required /></Field>
          <Field label="Note for the client" optional><textarea className="inp ta" name="note" id="gl-note" rows={3} placeholder="What to look for, and when you need feedback" /></Field>
          <Submit pending="Creating…"><Icon name="plus" />Create and add images</Submit>
        </form>
      </Card>
    </div>
  );

  if (tab === 'notes') body = (
    <Card title="Notes" icon="edit">
      <form className="composer" action={addNote}><Hidden v={h} /><textarea name="body" id="nt-body" rows={2} placeholder="Write a note about this project" /><div className="bar"><label className="check small"><input type="checkbox" name="shared" /> Share with {c.name.split(' ')[0]}</label><span className="sp" /><Submit pending="Adding…">Add note</Submit></div></form>
      <div className="rows">{N.map((nt) => (
        <div key={nt.id} className="lrow" style={{ alignItems: 'flex-start' }}><div className="grow"><p className="muted xs">{when(nt.created_at)}</p><p style={{ color: 'var(--ink-2)', fontSize: '.88rem', marginTop: 4, whiteSpace: 'pre-line' }}>{nt.body}</p></div>
          <form action={updateNote}><Hidden v={{ ...h, id: nt.id, op: 'share' }} /><button className={`chip ${nt.shared ? 'good' : 'line'}`} style={{ border: 0, cursor: 'pointer' }}>{nt.shared ? 'Shared' : 'Private'}</button></form>
          <form action={updateNote}><Hidden v={{ ...h, id: nt.id, op: 'delete' }} /><ConfirmSubmit className="ibtn xs" confirm="Delete?"><Icon name="trash" /></ConfirmSubmit></form></div>
      ))}</div>
    </Card>
  );

  if (tab === 'billing') body = (
    <Card title="Invoices" icon="receipt" extra={<form action={createInvoice}><Hidden v={{ ws: slug, project_id: id, contact_id: c.id }} /><Submit pending="Creating…"><Icon name="plus" />New invoice</Submit></form>}>
      {I.length ? <div className="rows">{I.map((i) => <Link key={i.id} className="lrow" href={`${b}/invoices/${i.id}`}><span className="ftype">{i.number.slice(-4)}</span><div className="grow"><b>{i.title}</b><p>{i.status === 'paid' ? 'Paid ' + date(i.paid_on) : i.issued_on ? `Issued ${date(i.issued_on)} · due ${date(i.due_on)}` : 'Not sent'}</p></div>{invoiceChip(i.status, tot[i.id].is_overdue, i.due_on)}<span className="amt">{money(tot[i.id].total, ws.currency)}</span></Link>)}</div> : <Empty icon="receipt" title="No invoices yet" />}
    </Card>
  );

  if (tab === 'contracts') body = (
    <Card title="Contracts" icon="sign" extra={<form action={createContract} className="row"><Hidden v={{ ws: slug, project_id: id }} /><select className="sel" name="template_id" id="ct-tpl" style={{ width: 'auto' }}>{(templates || []).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select><Submit pending="Drafting…"><Icon name="plus" />New contract</Submit></form>}>
      {K.length ? <div className="rows">{K.map((k) => <Link key={k.id} className="lrow" href={`${b}/contracts/${k.id}`}><span className="ftype"><Icon name="sign" /></span><div className="grow"><b>{k.title}</b><p>{k.number} · {k.status === 'signed' ? 'signed ' + date(k.client_signed_at) : k.sent_at ? 'sent ' + date(k.sent_at) : 'draft'}</p></div>{contractChip(k.status)}</Link>)}</div> : <Empty icon="sign" title="No contracts yet" text="Draft one from a template. The client and project details fill in automatically." />}
    </Card>
  );

  if (tab === 'activity') body = (
    <Card><div className="timeline">{((activity || []) as Activity[]).map((a) => <div key={a.id} className="tl"><i /><div><b style={{ fontWeight: 500 }}>{a.actor_name}</b> {a.message}<small>{when(a.created_at)}</small></div></div>)}{!(activity || []).length && <p className="muted small">No activity yet.</p>}</div></Card>
  );

  return (
    <div className="page">
      <Crumbs items={[['Projects', `${b}/projects`], [p.name]]} />
      <div className="phead">
        <div className="col g6"><p className="eyebrow">{p.code} · {p.service}</p><h1>{p.name}</h1><Link className="link small" href={`${b}/contacts/${c.id}`}>{c.name}{c.company ? ` · ${c.company}` : ''}</Link></div>
        <div className="acts"><Link className="btn" href={`${b}/inbox/${c.id}`}><Icon name="chat" />Message</Link></div>
      </div>
      <Tabs base={here} active={tab} items={[['overview', 'Overview'], ['tasks', 'Tasks', T.filter((t) => !t.done).length], ['files', 'Files', F.length], ['proofing', 'Proofing', G.length], ['notes', 'Notes', N.length], ['billing', 'Billing', I.length], ['contracts', 'Contracts', K.length], ['activity', 'Activity']]} />
      {body}
    </div>
  );
}
