import Link from 'next/link';
import { requireMember } from '@/lib/auth';
import { Card, Empty, PageHead } from '@/components/ui';
import { Icon } from '@/components/Icon';

export const metadata = { title: 'Search' };

export default async function Search({ params, searchParams }: { params: Promise<{ ws: string }>; searchParams: Promise<{ q?: string }> }) {
  const { ws: slug } = await params; const { q = '' } = await searchParams;
  const { supabase, ws } = await requireMember(slug);
  const term = q.trim().replace(/[%,()]/g, '');
  const b = `/s/${slug}`;
  const [c, p, i, k] = term ? await Promise.all([
    supabase.from('contacts').select('id, name, company, email').eq('workspace_id', ws.id).or(`name.ilike.%${term}%,company.ilike.%${term}%,email.ilike.%${term}%`).limit(10),
    supabase.from('projects').select('id, name, code').eq('workspace_id', ws.id).or(`name.ilike.%${term}%,code.ilike.%${term}%`).limit(10),
    supabase.from('invoices').select('id, number, title').eq('workspace_id', ws.id).or(`number.ilike.%${term}%,title.ilike.%${term}%`).limit(10),
    supabase.from('contracts').select('id, number, title').eq('workspace_id', ws.id).or(`number.ilike.%${term}%,title.ilike.%${term}%`).limit(10),
  ]) : [{ data: [] }, { data: [] }, { data: [] }, { data: [] }];
  const rows: [string, string, string, string][] = [
    ...(c.data || []).map((x) => ['user', x.name, [x.company, x.email].filter(Boolean).join(' · '), `${b}/contacts/${x.id}`] as [string, string, string, string]),
    ...(p.data || []).map((x) => ['folder', x.name, x.code, `${b}/projects/${x.id}`] as [string, string, string, string]),
    ...(i.data || []).map((x) => ['receipt', `${x.number} · ${x.title}`, 'Invoice', `${b}/invoices/${x.id}`] as [string, string, string, string]),
    ...(k.data || []).map((x) => ['sign', `${x.number} · ${x.title}`, 'Contract', `${b}/contracts/${x.id}`] as [string, string, string, string]),
  ];
  return (
    <div className="page">
      <PageHead eyebrow="Search" title={term ? `Results for “${q}”` : 'Search'} />
      <Card>{rows.length ? <div className="rows">{rows.map(([icon, t, s, h]) => <Link key={h} className="lrow" href={h}><span className="ftype"><Icon name={icon} /></span><div className="grow"><b>{t}</b><p>{s}</p></div></Link>)}</div> : <Empty icon="search" title={term ? 'Nothing found' : 'Type in the search bar'} text="Search clients, projects, invoice and contract numbers." />}</Card>
    </div>
  );
}
