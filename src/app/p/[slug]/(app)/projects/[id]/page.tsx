import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requirePortal } from '@/lib/auth';
import { Card, Chip, Crumbs, Hidden, Steps, invoiceChip, contractChip } from '@/components/ui';
import { FileUpload } from '@/components/FileUpload';
import { Icon } from '@/components/Icon';
import { clientToggleTask } from '../../../actions';
import { totalsFor } from '@/lib/data';
import { date, dateY, money, when } from '@/lib/format';
import type { Contract, FileRow, Invoice, Note, Project, Task } from '@/lib/types';

export default async function PortalProject({ params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params;
  const { supabase, ws } = await requirePortal(slug);
  const { data } = await supabase.from('projects').select('*').eq('id', id).maybeSingle();
  if (!data) notFound();
  const p = data as Project; const b = `/p/${slug}`;
  const [{ data: tasks }, { data: notes }, { data: files }, { data: invoices }, { data: contracts }] = await Promise.all([
    supabase.from('tasks').select('*').eq('project_id', id).order('position'),
    supabase.from('notes').select('*').eq('project_id', id).order('created_at', { ascending: false }),
    supabase.from('files').select('*').eq('project_id', id).order('created_at', { ascending: false }),
    supabase.from('invoices').select('*').eq('project_id', id).order('due_on'),
    supabase.from('contracts').select('*').eq('project_id', id),
  ]);
  const T = (tasks || []) as Task[], I = (invoices || []) as Invoice[];
  const tot = await totalsFor(supabase, I.map((i) => i.id));
  return (
    <div className="page">
      <Crumbs items={[['Overview', b], [p.name]]} />
      <div className="phead"><div className="col g6"><p className="eyebrow">{p.code} · {p.service}</p><h1>{p.name}</h1></div><div className="acts"><Link className="btn primary" href={`${b}/messages`}><Icon name="chat" />Message {ws.name}</Link></div></div>
      <div className="split">
        <div className="stack">
          <Card>
            <Steps stages={p.stages} stage={p.status === 'completed' ? p.stages.length : p.stage} />
            {p.summary && <p className="body">{p.summary}</p>}
            <div className="g3" style={{ gap: 10 }}><div className="sub"><p className="muted xs">Started</p><b>{dateY(p.start_date)}</b></div><div className="sub"><p className="muted xs">Now</p><b>{p.status === 'completed' ? 'Completed' : p.stages[p.stage]}</b></div><div className="sub"><p className="muted xs">Handoff</p><b>{p.due_date ? dateY(p.due_date) : 'To be set'}</b></div></div>
          </Card>
          {T.length > 0 && (
            <Card title="Plan" icon="list" extra={<span className="muted small">{T.filter((t) => t.done).length} of {T.length} done</span>}>
              <div className="rows">{T.map((t) => (
                <div key={t.id} className={`task${t.done ? ' done' : ''}`}>
                  {t.for_client ? <form action={clientToggleTask}><Hidden v={{ slug, id: t.id, project_id: id }} /><button className="cbx" style={{ background: t.done ? 'var(--pill)' : 'none', borderColor: t.done ? 'var(--pill)' : undefined, color: 'var(--pill-fg)' }} aria-label={t.done ? 'Mark as not done' : 'Mark as done'}>{t.done && <Icon name="check" size={12} />}</button></form>
                    : <span className="cbx" style={{ background: t.done ? 'var(--pill)' : 'none', borderColor: t.done ? 'var(--pill)' : undefined, color: 'var(--pill-fg)', opacity: 0.7 }} aria-label={t.done ? 'Done' : 'Not done yet'}>{t.done && <Icon name="check" size={12} />}</span>}
                  <div className="grow"><p className="tt">{t.title}</p><p className="muted xs">{t.done ? 'Done' : t.due_date ? 'Due ' + date(t.due_date) : ''}</p></div>{t.for_client ? <Chip tone={t.done ? 'good' : 'ink'}>You</Chip> : <Chip tone="line">{ws.name}</Chip>}
                </div>
              ))}</div>
            </Card>
          )}
          {(notes || []).length > 0 && <Card title={`Notes from ${ws.name}`} icon="edit"><div className="rows">{((notes || []) as Note[]).map((n) => <div key={n.id} className="lrow" style={{ alignItems: 'flex-start' }}><div className="grow"><p className="muted xs">{when(n.created_at)}</p><p style={{ color: 'var(--ink-2)', fontSize: '.88rem', marginTop: 4, whiteSpace: 'pre-line' }}>{n.body}</p></div></div>)}</div></Card>}
        </div>
        <div className="stack">
          <Card title="Documents" icon="doc"><div className="rows">
            {((contracts || []) as Contract[]).map((k) => <Link key={k.id} className="lrow" href={`${b}/contracts/${k.id}`}><span className="ftype"><Icon name="sign" /></span><div className="grow"><b>{k.title}</b><p>{k.number}</p></div>{contractChip(k.status, true)}</Link>)}
            {I.map((i) => <Link key={i.id} className="lrow" href={`${b}/invoices/${i.id}`}><span className="ftype"><Icon name="receipt" /></span><div className="grow"><b>{i.title}</b><p>{i.number} · {money(tot[i.id].total, ws.currency)}</p></div>{invoiceChip(i.status, tot[i.id].is_overdue, i.due_on)}</Link>)}
            {!I.length && !(contracts || []).length && <p className="muted small">No documents yet.</p>}
          </div></Card>
          <Card title="Files" icon="folder">
            {((files || []) as FileRow[]).length ? <div className="rows">{((files || []) as FileRow[]).map((f) => <a key={f.id} className="lrow" href={`/api/files/${f.id}`}><span className="ftype">{f.name.split('.').pop()?.toUpperCase().slice(0, 4)}</span><div className="grow"><b className="ellip">{f.name}</b><p>{f.by_client ? 'You' : ws.name} · {date(f.created_at)}</p></div><Icon name="download" size={15} /></a>)}</div> : <p className="muted small">No files yet.</p>}
            <FileUpload projectId={id} />
          </Card>
        </div>
      </div>
    </div>
  );
}
