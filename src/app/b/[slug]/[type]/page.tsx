import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase/admin';
import { Crumbs, Empty, Field } from '@/components/ui';
import { StudioMark } from '@/components/docs';
import { Submit } from '@/components/client';
import { Icon } from '@/components/Icon';
import { publicBook } from '../../actions';
import { fmtDay, fmtTime, freeSlots, tzLabel } from '@/lib/slots';
import type { BookingType, Workspace } from '@/lib/types';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Pick a time' };

const dayParts = (ymd: string, tz: string) => {
  const d = new Date(ymd + 'T12:00:00Z');
  return { wd: new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', weekday: 'short' }).format(d), dn: d.getUTCDate(), mo: new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', month: 'short' }).format(d), tz };
};

export default async function BookingSlots({ params, searchParams }: { params: Promise<{ slug: string; type: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { slug, type } = await params; const sp = await searchParams;
  const db = createAdminClient();
  const { data: w } = await db.from('workspaces').select('*').eq('slug', slug).maybeSingle();
  if (!w || !w.booking_enabled) notFound();
  const ws = w as Workspace; const tz = ws.booking_timezone;
  const { data: t } = await db.from('booking_types').select('*').eq('id', type).eq('workspace_id', ws.id).eq('active', true).maybeSingle();
  if (!t) notFound();
  const bt = t as BookingType;
  const { data: busy } = await db.from('bookings').select('starts_at, ends_at').eq('workspace_id', ws.id).eq('status', 'confirmed').gte('ends_at', new Date().toISOString());
  const days = freeSlots({ tz, hours: ws.booking_hours, noticeHours: ws.booking_notice_hours, windowDays: ws.booking_window_days, bufferMin: ws.booking_buffer_min }, bt.duration_min, busy || []);
  const picked = sp.t && days.some((d) => d.slots.includes(sp.t!)) ? sp.t : undefined;
  const day = days.find((d) => d.day === sp.day) || (picked ? days.find((d) => d.slots.includes(picked)) : undefined) || days[0];
  const base = `/b/${slug}/${type}`;
  return (
    <div className="bk">
      <header className="bk-head"><StudioMark ws={ws} /><div><b>{ws.name}</b><p className="muted xs">{tzLabel(tz)}</p></div></header>
      <section className="card bk-card">
        <Crumbs items={[['All meetings', `/b/${slug}`], [bt.name]]} />
        <div className="col g6"><h1>{bt.name}</h1><p className="muted small"><Icon name="clock" size={14} className="inl" /> {bt.duration_min} min · {bt.location}</p>{bt.description && <p className="ink2 small">{bt.description}</p>}</div>
        {!days.length ? <Empty icon="cal" title="No times available" text={`Nothing is open in the next ${ws.booking_window_days} days. Email ${ws.email || ws.name} to arrange a time.`} /> : picked ? (
          <form action={publicBook} className="col g12">
            <input type="hidden" name="slug" value={slug} /><input type="hidden" name="type" value={type} /><input type="hidden" name="at" value={picked} />
            <div className="notice info"><Icon name="cal" /><div><b>{fmtDay(picked, tz)} at {fmtTime(picked, tz)}</b><br /><span className="xs">{tzLabel(tz)} · <Link href={`${base}?day=${day?.day}`}>Change time</Link></span></div></div>
            <div className="fields">
              <Field label="Your name"><input className="inp" name="name" id="bk-name" required autoComplete="name" /></Field>
              <Field label="Email"><input className="inp" type="email" name="email" id="bk-email" required autoComplete="email" /></Field>
              <Field label="Phone" optional><input className="inp" name="phone" id="bk-phone" autoComplete="tel" /></Field>
              <Field label="Company" optional><input className="inp" name="company" id="bk-company" autoComplete="organization" /></Field>
            </div>
            <Field label="What would you like to talk about?" optional><textarea className="inp ta" name="notes" id="bk-notes" rows={3} /></Field>
            <input type="text" name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" style={{ position: 'absolute', left: '-9999px' }} />
            <Submit className="btn primary lg block" pending="Booking…"><Icon name="check" />Confirm booking</Submit>
          </form>
        ) : <>
          <div className="bk-days" role="group" aria-label="Choose a day">{days.slice(0, 21).map((d) => { const p = dayParts(d.day, tz); return (
            <Link key={d.day} href={`${base}?day=${d.day}`} aria-current={d.day === day?.day ? 'true' : undefined}><small>{p.wd}</small><b>{p.dn}</b><small>{p.mo}</small></Link>
          ); })}</div>
          {day && <div className="col g8"><p className="small"><b>{fmtDay(day.slots[0], tz)}</b> <span className="muted">· {day.slots.length} time{day.slots.length === 1 ? '' : 's'}</span></p>
            <div className="bk-slots">{day.slots.map((iso) => <Link key={iso} href={`${base}?t=${encodeURIComponent(iso)}`}>{fmtTime(iso, tz)}</Link>)}</div></div>}
        </>}
      </section>
      <p className="muted xs bk-foot">Scheduling by Onera</p>
    </div>
  );
}
