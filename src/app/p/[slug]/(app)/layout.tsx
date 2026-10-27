import Link from 'next/link';
import { requirePortal } from '@/lib/auth';
import { NavRail } from '@/components/client';
import { Avatar } from '@/components/ui';
import { Icon } from '@/components/Icon';
import { StudioMark } from '@/components/docs';
import { portalSignOut } from '../actions';

export default async function PortalLayout({ children, params }: { children: React.ReactNode; params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { supabase, ws, contact } = await requirePortal(slug);
  const [{ count: unread }, { count: toPay }, { count: toSign }, { count: toAccept }, { count: toReview }] = await Promise.all([
    supabase.from('messages').select('id', { count: 'exact', head: true }).eq('contact_id', contact.id).eq('from_client', false).is('read_by_client_at', null),
    supabase.from('invoices').select('id', { count: 'exact', head: true }).eq('contact_id', contact.id).eq('status', 'sent'),
    supabase.from('contracts').select('id', { count: 'exact', head: true }).eq('contact_id', contact.id).eq('status', 'sent'),
    supabase.from('proposals').select('id', { count: 'exact', head: true }).eq('contact_id', contact.id).eq('status', 'sent'),
    supabase.from('galleries').select('id', { count: 'exact', head: true }).eq('status', 'shared'),
  ]);
  const b = `/p/${slug}`;
  return (
    <section className="app" aria-label={`${ws.name} client portal`}>
      <NavRail base={b} items={[
        { href: b, icon: 'home', label: 'Overview' }, { href: `${b}/proposals`, icon: 'quote', label: 'Proposals', badge: toAccept || 0 }, { href: `${b}/invoices`, icon: 'receipt', label: 'Invoices', badge: toPay || 0 },
        { href: `${b}/contracts`, icon: 'sign', label: 'Contracts', badge: toSign || 0 }, { href: `${b}/galleries`, icon: 'image', label: 'Galleries', badge: toReview || 0 }, { href: `${b}/files`, icon: 'folder', label: 'Files' },
        { href: `${b}/messages`, icon: 'chat', label: 'Messages', badge: unread || 0 },
      ]} footer={<>
        <Link className="ibtn" href={`${b}/account`} aria-label="Account"><Icon name="user" /><span className="tip">Account</span></Link>
        <form action={portalSignOut}><input type="hidden" name="slug" value={slug} /><button className="ibtn" aria-label="Sign out"><Icon name="logout" /><span className="tip">Sign out</span></button></form>
        <Avatar name={contact.name} />
      </>} />
      <div className="content">
        <div className="topbar">
          <div className="who"><StudioMark ws={ws} /><div className="n"><b style={{ color: 'var(--ink)' }}>{ws.name}</b><small>Client portal for {contact.company || contact.name}</small></div></div>
          <span className="sp" />
          <Link className="cta" href={`${b}/messages`} style={{ background: ws.brand_color, color: '#fff' }}><Icon name="chat" />Message {ws.name.split(' ')[0]}</Link>
        </div>
        <main className="main">{children}</main>
      </div>
    </section>
  );
}
