import Link from 'next/link';
import { requireMember } from '@/lib/auth';
import { NavRail } from '@/components/client';
import { Avatar } from '@/components/ui';
import { Icon } from '@/components/Icon';
import { signOut } from '@/app/auth/actions';
import { portalUrl } from '@/lib/env';
import { PLANS, type PlanKey } from '@/lib/plans';

export default async function StudioLayout({ children, params }: { children: React.ReactNode; params: Promise<{ ws: string }> }) {
  const { ws: slug } = await params;
  const { supabase, ws, name } = await requireMember(slug);
  const [{ count: unread }, { count: newLeads }] = await Promise.all([
    supabase.from('messages').select('id', { count: 'exact', head: true }).eq('workspace_id', ws.id).eq('from_client', true).is('read_by_studio_at', null),
    supabase.from('leads').select('id', { count: 'exact', head: true }).eq('workspace_id', ws.id).eq('stage', 'new'),
  ]);
  const b = `/s/${slug}`;
  const trialDays = Math.ceil((new Date(ws.trial_ends_at).getTime() - Date.now()) / 864e5);
  return (
    <section className="app tall" aria-label={`${ws.name} studio`}>
      <NavRail base={b} items={[
        { href: b, icon: 'home', label: 'Overview' }, { href: `${b}/inbox`, icon: 'chat', label: 'Inbox', badge: unread || 0 }, '|',
        { href: `${b}/leads`, icon: 'users', label: 'Leads', badge: newLeads || 0 }, { href: `${b}/bookings`, icon: 'cal', label: 'Bookings' }, { href: `${b}/contacts`, icon: 'user', label: 'Contacts' }, { href: `${b}/projects`, icon: 'folder', label: 'Projects' }, '|',
        { href: `${b}/proposals`, icon: 'quote', label: 'Proposals' }, { href: `${b}/invoices`, icon: 'receipt', label: 'Invoices' }, { href: `${b}/contracts`, icon: 'sign', label: 'Contracts' },
      ]} footer={<>
        <Link className="ibtn" href={`${b}/settings`} aria-label="Settings"><Icon name="gear" /><span className="tip">Settings</span></Link>
        <form action={signOut}><button className="ibtn" aria-label="Sign out"><Icon name="logout" /><span className="tip">Sign out</span></button></form>
        <Avatar name={name} />
      </>} />
      <div className="content">
        <div className="topbar">
          <form className="search" action={`${b}/search`}><Icon name="search" /><input name="q" id="studio-search" placeholder="Search clients, projects, invoices" autoComplete="off" /></form>
          <span className="sp" />
          {ws.plan_status === 'trialing' && trialDays > 0 && <Link className="chip info" href={`${b}/settings?tab=billing`}>Trial · {trialDays} day{trialDays === 1 ? '' : 's'} left</Link>}
          {ws.plan_status === 'past_due' && <Link className="chip urgent" href={`${b}/settings?tab=billing`}>Payment failed · update billing</Link>}
          <a className="ibtn" href={portalUrl(slug)} target="_blank" rel="noreferrer" aria-label="Open your client portal"><Icon name="globe" /></a>
          <Link className="ibtn" href={`${b}/settings`} aria-label="Settings"><Icon name="gear" /></Link>
          <Link className="cta" href={`${b}/projects?new=1`}><Icon name="plus" />New project</Link>
        </div>
        <main className="main" data-plan={PLANS[ws.plan as PlanKey]?.name}>{children}</main>
      </div>
    </section>
  );
}
