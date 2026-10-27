import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase/admin';
import { Empty } from '@/components/ui';
import { StudioMark } from '@/components/docs';
import { Icon } from '@/components/Icon';
import { tzLabel } from '@/lib/slots';
import type { BookingType, Workspace } from '@/lib/types';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { data } = await createAdminClient().from('workspaces').select('name').eq('slug', slug).maybeSingle();
  return { title: data ? `Book a time with ${data.name}` : 'Book a time' };
}

export default async function BookingHome({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const db = createAdminClient();
  const { data: w } = await db.from('workspaces').select('*').eq('slug', slug).maybeSingle();
  if (!w) notFound();
  const ws = w as Workspace;
  const { data: types } = ws.booking_enabled ? await db.from('booking_types').select('*').eq('workspace_id', ws.id).eq('active', true).order('position').order('created_at') : { data: [] };
  return (
    <div className="bk">
      <header className="bk-head"><StudioMark ws={ws} /><div><b>{ws.name}</b><p className="muted xs">{tzLabel(ws.booking_timezone)}</p></div></header>
      <section className="card bk-card">
        <h1>Book a time with {ws.name}</h1>
        <p className="muted">{ws.booking_intro}</p>
        {ws.booking_enabled && (types || []).length ? <div className="rows">{((types || []) as BookingType[]).map((t) => (
          <Link key={t.id} className="lrow bk-type" href={`/b/${slug}/${t.id}`}>
            <span className="ftype"><Icon name="cal" /></span>
            <div className="grow"><b>{t.name}</b><p>{t.duration_min} min · {t.location}</p>{t.description && <p style={{ marginTop: 4 }}>{t.description}</p>}</div>
            <Icon name="arrow" size={16} />
          </Link>
        ))}</div> : <Empty icon="cal" title="Online booking is closed" text={`Email ${ws.email || ws.name} to arrange a time.`} />}
      </section>
      <p className="muted xs bk-foot">Scheduling by Onera</p>
    </div>
  );
}
