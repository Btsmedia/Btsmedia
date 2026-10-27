import Link from 'next/link';
import { requireMember } from '@/lib/auth';
import { Card, Chip, Field, Hidden, PageHead } from '@/components/ui';
import { Submit } from '@/components/client';
import { Icon } from '@/components/Icon';
import { createProject } from '../actions';
import { addDays, date, money, today } from '@/lib/format';
import { PLANS, type PlanKey } from '@/lib/plans';
import type { Contact, Project } from '@/lib/types';

export const metadata = { title: 'Projects' };

export default async function Projects({ params, searchParams }: { params: Promise<{ ws: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { ws: slug } = await params; const sp = await searchParams;
  const { supabase, ws } = await requireMember(slug);
  const f = sp.f || 'active';
  let q = supabase.from('projects').select('*, contacts(name, company)').eq('workspace_id', ws.id).order('due_date', { ascending: true, nullsFirst: false });
  if (f !== 'all') q = q.eq('status', f);
  const [{ data }, { data: contacts }, { data: tasks }] = await Promise.all([
    q, supabase.from('contacts').select('id, name, company').eq('workspace_id', ws.id).order('name'),
    supabase.from('tasks').select('project_id, done').eq('workspace_id', ws.id),
  ]);
  const projects = (data || []) as (Project & { contacts: Contact })[];
  const prog: Record<string, [number, number]> = {};
  (tasks || []).forEach((t) => { const p = prog[t.project_id] || [0, 0]; p[1]++; if (t.done) p[0]++; prog[t.project_id] = p; });
  const b = `/s/${slug}/projects`;
  const plan = PLANS[ws.plan as PlanKey];
  return (
    <div className="page">
      <PageHead eyebrow={plan.activeProjects === Infinity ? 'Unlimited active projects on your plan' : `${plan.name} plan · up to ${plan.activeProjects} active projects`} title="Projects" actions={<Link className="btn primary" href={`${b}?new=1`}><Icon name="plus" />New project</Link>} />
      {sp.new && (
        <form className="card" action={createProject}>
          <Hidden v={{ ws: slug }} />
          <div className="chead"><span className="t"><Icon name="folder" />New project</span><Link className="ibtn sm" href={b} aria-label="Close"><Icon name="x" /></Link></div>
          {(contacts || []).length ? <>
            <div className="fields">
              <Field label="Project name"><input className="inp" name="name" id="p-name" required placeholder="e.g. Lumi brand identity" /></Field>
              <Field label="Client"><select className="sel" name="contact_id" id="p-contact" defaultValue={sp.contact || ''} required><option value="" disabled>Choose a client</option>{(contacts || []).map((c) => <option key={c.id} value={c.id}>{c.name}{c.company ? ` · ${c.company}` : ''}</option>)}</select></Field>
            </div>
            <div className="fields three" style={{ gridTemplateColumns: 'repeat(4,minmax(0,1fr))' }}>
              <Field label="Service"><input className="inp" name="service" id="p-service" defaultValue="Brand identity" /></Field>
              <Field label={`Value (${ws.currency})`}><input className="inp" type="number" min="0" step="1000" name="value" id="p-value" defaultValue="0" /></Field>
              <Field label="Start"><input className="inp" type="date" name="start" id="p-start" defaultValue={today()} /></Field>
              <Field label="Handoff"><input className="inp" type="date" name="due" id="p-due" defaultValue={addDays(today(), 28)} /></Field>
            </div>
            <p className="muted xs">A starter task list is added. Website projects get website stages and tasks.</p>
            <div className="row"><span className="sp" /><Submit pending="Creating…">Create project</Submit></div>
          </> : <p className="muted small">Add a client first. <Link href={`/s/${slug}/contacts?new=1`}>New contact</Link></p>}
        </form>
      )}
      <Card>
        <div className="tabbar">{[['active', 'Active'], ['on_hold', 'On hold'], ['completed', 'Completed'], ['all', 'All']].map(([k, l]) => <Link key={k} className="tablink" data-on={f === k} href={`${b}?f=${k}`}>{l}</Link>)}</div>
        {projects.length ? (
          <div className="tblwrap"><table className="tbl"><thead><tr><th>Project</th><th>Client</th><th>Stage</th><th>Tasks</th><th>Handoff</th><th className="r">Value</th></tr></thead><tbody>
            {projects.map((p) => { const [d, t] = prog[p.id] || [0, 0]; return (
              <tr key={p.id}><td><Link href={`${b}/${p.id}`} style={{ color: 'inherit', textDecoration: 'none' }}><b style={{ fontWeight: 500 }}>{p.name}</b><div className="mono xs muted">{p.code}</div></Link></td><td>{p.contacts.name}</td>
                <td>{p.status === 'completed' ? <Chip tone="good">Completed</Chip> : p.status === 'on_hold' ? <Chip tone="warn">On hold</Chip> : <Chip>{p.stages[p.stage]}</Chip>}</td>
                <td style={{ minWidth: 120 }}><div className="prog thin"><i style={{ width: `${t ? (d / t) * 100 : 0}%` }} /></div><span className="muted xs">{d}/{t}</span></td>
                <td>{date(p.due_date)}</td><td className="r num">{money(p.value, ws.currency)}</td></tr>
            ); })}
          </tbody></table></div>
        ) : <div className="empty"><b>No {f === 'all' ? '' : f.replace('_', ' ')} projects</b><Link className="btn primary" href={`${b}?new=1`}>Create a project</Link></div>}
      </Card>
    </div>
  );
}
