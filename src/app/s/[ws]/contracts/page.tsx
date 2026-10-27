import Link from 'next/link';
import { requireMember } from '@/lib/auth';
import { Card, Field, Hidden, PageHead, contractChip } from '@/components/ui';
import { Submit } from '@/components/client';
import { Icon } from '@/components/Icon';
import { createContract } from '../actions';
import { date } from '@/lib/format';
import type { Contact, Contract, Project, Section } from '@/lib/types';

export const metadata = { title: 'Contracts' };

export default async function Contracts({ params, searchParams }: { params: Promise<{ ws: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { ws: slug } = await params; const sp = await searchParams;
  const { supabase, ws } = await requireMember(slug);
  const tab = sp.tab || 'contracts', f = sp.f || 'all';
  const b = `/s/${slug}/contracts`;
  const head = (
    <PageHead eyebrow="Agreements and e-signatures" title="Contracts" actions={<>
      <div className="tabbar"><Link className="tablink" data-on={tab === 'contracts'} href={b}>Contracts</Link><Link className="tablink" data-on={tab === 'templates'} href={`${b}?tab=templates`}>Templates</Link></div>
      {tab === 'templates' ? <Link className="btn primary" href={`${b}/templates/new`}><Icon name="plus" />New template</Link> : <Link className="btn primary" href={`${b}?new=1`}><Icon name="plus" />New contract</Link>}
    </>} />
  );
  if (tab === 'templates') {
    const { data } = await supabase.from('contract_templates').select('*').eq('workspace_id', ws.id).order('created_at');
    return (
      <div className="page">{head}
        <div className="g3">{(data || []).map((t) => (
          <Link key={t.id} className="card" href={`${b}/templates/${t.id}`}><span className="ftype" style={{ background: 'var(--tint)' }}><Icon name="tpl" /></span><h2>{t.name}</h2><p className="muted small">{(t.sections as Section[]).length} sections</p>
            <div className="varchips">{[...new Set((t.sections as Section[]).flatMap((s) => s.body.match(/\{\{[\w.]+\}\}/g) || []))].slice(0, 4).map((v) => <span key={v} className="chip info mono">{v}</span>)}</div></Link>
        ))}</div>
      </div>
    );
  }
  const [{ data }, { data: projects }, { data: templates }] = await Promise.all([
    supabase.from('contracts').select('*, contacts(name), projects(name)').eq('workspace_id', ws.id).order('created_at', { ascending: false }),
    supabase.from('projects').select('id, name').eq('workspace_id', ws.id).in('status', ['active', 'on_hold']).order('name'),
    supabase.from('contract_templates').select('id, name').eq('workspace_id', ws.id).order('created_at'),
  ]);
  const list = ((data || []) as (Contract & { contacts: Contact; projects: Project | null })[]).filter((k) => f === 'all' || k.status === f);
  return (
    <div className="page">{head}
      {sp.new && (
        <form className="card" action={createContract}>
          <Hidden v={{ ws: slug }} />
          <div className="chead"><span className="t"><Icon name="sign" />New contract</span><Link className="ibtn sm" href={b} aria-label="Close"><Icon name="x" /></Link></div>
          <div className="fields"><Field label="Project" hint="The client and project details fill in automatically"><select className="sel" name="project_id" id="nc-project" required defaultValue=""><option value="" disabled>Choose a project</option>{(projects || []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
            <Field label="Template"><select className="sel" name="template_id" id="nc-template">{(templates || []).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></Field></div>
          <div className="row"><span className="sp" /><Submit pending="Drafting…">Draft contract</Submit></div>
        </form>
      )}
      <Card>
        <div className="tabbar">{[['all', 'All'], ['sent', 'Awaiting client'], ['changes', 'Changes requested'], ['signed', 'Signed'], ['draft', 'Drafts']].map(([k, l]) => <Link key={k} className="tablink" data-on={f === k} href={`${b}?f=${k}`}>{l}</Link>)}</div>
        {list.length ? <div className="tblwrap"><table className="tbl"><thead><tr><th>Contract</th><th>Client</th><th>Project</th><th>Sent</th><th>Signed</th><th>Status</th></tr></thead><tbody>
          {list.map((k) => <tr key={k.id}><td><Link href={`${b}/${k.id}`} style={{ color: 'inherit', textDecoration: 'none' }}><b style={{ fontWeight: 500 }}>{k.title}</b><div className="mono xs muted">{k.number}</div></Link></td><td>{k.contacts.name}</td><td>{k.projects?.name || '–'}</td><td>{k.sent_at ? date(k.sent_at) : '–'}</td><td>{k.client_signed_at ? date(k.client_signed_at) : '–'}</td><td>{contractChip(k.status)}</td></tr>)}
        </tbody></table></div> : <div className="empty"><b>No contracts here</b><Link className="btn primary" href={`${b}?new=1`}>Draft a contract</Link></div>}
      </Card>
    </div>
  );
}
