import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase/admin';
import { Field, Notice } from '@/components/ui';
import { StudioMark } from '@/components/docs';
import { Submit } from '@/components/client';
import { Icon } from '@/components/Icon';
import { publicCancel } from '../../actions';
import { fmtDay, fmtTime, googleCalLink, tzLabel } from '@/lib/slots';
import type { Booking, Workspace } from '@/lib/types';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Your booking' };

export default async function ManageBooking({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { token } = await params; const sp = await searchParams;
  if (!/^[a-f0-9]{20,64}$/.test(token)) notFound();
  const { data } = await createAdminClient().from('bookings').select('*, workspaces(*), booking_types(location)').eq('manage_token', token).maybeSingle();
  if (!data) notFound();
  const bk = data as Booking & { workspaces: Workspace; booking_types: { location: string } | null };
  const ws = bk.workspaces, tz = ws.booking_timezone;
  const past = new Date(bk.starts_at) < new Date();
  return (
    <div className="bk">
      <header className="bk-head"><StudioMark ws={ws} /><div><b>{ws.name}</b><p className="muted xs">{tzLabel(tz)}</p></div></header>
      <section className="card bk-card">
        {sp.new && bk.status === 'confirmed' && <Notice tone="good" icon="check">You&apos;re booked in. A confirmation is on its way to {bk.email}.</Notice>}
        {bk.status === 'cancelled' && <Notice tone="plain" icon="x">This booking is cancelled.</Notice>}
        <div className="col g6"><p className="eyebrow">{bk.title}</p><h1>{fmtDay(bk.starts_at, tz, true)}</h1><p className="ink2">{fmtTime(bk.starts_at, tz)} to {fmtTime(bk.ends_at, tz)} · {tzLabel(tz)}</p>{bk.booking_types?.location && <p className="muted small">{bk.booking_types.location}</p>}</div>
        {bk.status === 'confirmed' && !past && <>
          <a className="btn block" href={googleCalLink(`${bk.title} with ${ws.name}`, bk.starts_at, bk.ends_at, bk.booking_types?.location || '')} target="_blank" rel="noreferrer"><Icon name="cal" />Add to Google Calendar</a>
          <details><summary className="small" style={{ cursor: 'pointer' }}>Need to cancel?</summary>
            <form action={publicCancel} className="col g8" style={{ marginTop: 10 }}><input type="hidden" name="token" value={token} />
              <Field label="Reason" optional><textarea className="inp ta" name="reason" id="bk-reason" rows={2} /></Field>
              <Submit className="btn danger block" pending="Cancelling…">Cancel this booking</Submit>
            </form>
          </details>
        </>}
        {ws.booking_enabled && <Link className="link small" href={`/b/${ws.slug}`}>Book {bk.status === 'cancelled' ? 'another' : 'a different'} time</Link>}
      </section>
    </div>
  );
}
