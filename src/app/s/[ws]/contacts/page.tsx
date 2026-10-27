import Link from 'next/link';
import { requireMember } from '@/lib/auth';
import { Avatar, Card, Chip, Field, Hidden, PageHead } from '@/components/ui';
import { Submit } from '@/components/client';
import { Icon } from '@/components/Icon';
import { createContact } from '../actions';
import type { Contact } from '@/lib/types';

export const metadata = { title: 'Contacts' };

export default async function Contacts({ params, searchParams }: { params: Promise<{ ws: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { ws: slug } = await params; const sp = await searchParams;
  const { supabase, ws } = await requireMember(slug);
  const f = sp.f || 'all', q = (sp.q || '').trim();
  let query = supabase.from('contacts').select('*').eq('workspace_id', ws.id).order('name');
  if (f !== 'all') query = query.eq('type', f);
  if (q) query = query.or(`name.ilike.%${q.replace(/[%,()]/g, '')}%,company.ilike.%${q.replace(/[%,()]/g, '')}%,email.ilike.%${q.replace(/[%,()]/g, '')}%`);
  const { data } = await query;
  const list = (data || []) as Contact[];
  const { data: proj } = await supabase.from('projects').select('contact_id').eq('workspace_id', ws.id);
  const pc: Record<string, number> = {}; (proj || []).forEach((p) => { pc[p.contact_id] = (pc[p.contact_id] || 0) + 1; });
  const b = `/s/${slug}/contacts`;
  return (
    <div className="page">
      <PageHead eyebrow={`${list.length} people`} title="Contacts" actions={<Link className="btn primary" href={`${b}?new=1`}><Icon name="plus" />New contact</Link>} />
      {sp.new && (
        <form className="card" action={createContact}>
          <Hidden v={{ ws: slug }} />
          <div className="chead"><span className="t"><Icon name="user" />New contact</span><Link className="ibtn sm" href={b} aria-label="Close"><Icon name="x" /></Link></div>
          <div className="fields three">
            <Field label="Name"><input className="inp" name="name" id="c-name" required /></Field>
            <Field label="Company" optional><input className="inp" name="company" id="c-company" /></Field>
            <Field label="Email" optional><input className="inp" name="email" id="c-email" type="email" /></Field>
            <Field label="Phone" optional><input className="inp" name="phone" id="c-phone" /></Field>
            <Field label="City" optional><input className="inp" name="city" id="c-city" /></Field>
            <Field label="Type"><select className="sel" name="type" id="c-type"><option value="client">Client</option><option value="lead">Lead</option><option value="collaborator">Collaborator</option></select></Field>
          </div>
          <div className="row"><span className="sp" /><Submit pending="Adding…">Add contact</Submit></div>
        </form>
      )}
      <Card>
        <form className="row wrap" action={b}>
          <div className="tabbar">{[['all', 'All'], ['client', 'Clients'], ['lead', 'Leads'], ['collaborator', 'Collaborators']].map(([k, l]) => <Link key={k} className="tablink" data-on={f === k} href={`${b}?f=${k}${q ? '&q=' + encodeURIComponent(q) : ''}`}>{l}</Link>)}</div>
          <span className="sp" /><input type="hidden" name="f" value={f} /><input className="inp" name="q" id="ct-q" defaultValue={q} placeholder="Search name, company or email" style={{ width: 'min(280px,100%)' }} />
        </form>
        {list.length ? (
          <div className="tblwrap"><table className="tbl"><thead><tr><th>Name</th><th>Type</th><th>Email</th><th>Projects</th><th>Portal</th></tr></thead><tbody>
            {list.map((c) => (
              <tr key={c.id}><td><Link href={`${b}/${c.id}`} className="who" style={{ textDecoration: 'none', color: 'inherit' }}><Avatar name={c.name} size="sm" /><span className="n"><b style={{ color: 'var(--ink)', fontWeight: 500 }}>{c.name}</b><small>{c.company}</small></span></Link></td>
                <td><Chip tone={c.type === 'lead' ? 'info' : 'line'}>{c.type[0].toUpperCase() + c.type.slice(1)}</Chip></td><td className="muted">{c.email || '–'}</td><td>{pc[c.id] || 0}</td>
                <td>{c.portal_status === 'active' ? <Chip tone="good">Active</Chip> : c.portal_status === 'invited' ? <Chip tone="warn">Invited</Chip> : <span className="muted">–</span>}</td></tr>
            ))}
          </tbody></table></div>
        ) : <div className="empty"><b>No contacts {q ? `match “${q}”` : 'yet'}</b><Link className="btn primary" href={`${b}?new=1`}>Add a contact</Link></div>}
      </Card>
    </div>
  );
}
