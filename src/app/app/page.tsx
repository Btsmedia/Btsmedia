import { redirect } from 'next/navigation';
import Link from 'next/link';
import { requireUser } from '@/lib/auth';

/** Sends a signed-in user to their studio, or to onboarding if they don't have one yet. */
export default async function AppHome() {
  const { supabase, user } = await requireUser('/app');
  const { data } = await supabase.from('workspace_members').select('role, workspaces(slug, name)').eq('user_id', user.id);
  const list = (data || []).map((m) => (Array.isArray(m.workspaces) ? m.workspaces[0] : m.workspaces) as { slug: string; name: string });
  if (list.length === 1) redirect(`/s/${list[0].slug}`);
  if (!list.length) {
    const { data: portals } = await supabase.from('contacts').select('workspaces(slug, name)').eq('portal_user_id', user.id);
    const p = (portals || []).map((x) => (Array.isArray(x.workspaces) ? x.workspaces[0] : x.workspaces) as { slug: string; name: string });
    if (p.length === 1) redirect(`/p/${p[0].slug}`);
    if (!p.length) redirect('/onboarding');
    return <Picker title="Your client portals" items={p.map((x) => [x.name, `/p/${x.slug}`])} />;
  }
  return <Picker title="Choose a studio" items={list.map((x) => [x.name, `/s/${x.slug}`])} />;
}

function Picker({ title, items }: { title: string; items: [string, string][] }) {
  return (
    <div className="page-narrow" style={{ paddingBlock: '8vh' }}>
      <section className="card"><h1>{title}</h1><div className="rows">{items.map(([n, h]) => <Link key={h} className="lrow" href={h}><span className="grow"><b>{n}</b></span></Link>)}</div>
        <Link className="link" href="/onboarding">Create another studio</Link></section>
    </div>
  );
}
