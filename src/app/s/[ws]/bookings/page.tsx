import Link from 'next/link';
import { requireMember } from '@/lib/auth';
import { Card, Chip, Empty, Field, Hidden, Notice, PageHead, Tabs, Toggle } from '@/components/ui';
import { ConfirmSubmit, CopyButton, Submit } from '@/components/client';
import { Icon } from '@/components/Icon';
import { bookingAction, bookingTypeAction, saveBookingSettings } from '../more-actions';
import { env } from '@/lib/env';
import { fmtDay, fmtTime, tzLabel, WEEKDAYS } from '@/lib/slots';
import type { Booking, BookingType } from '@/lib/types';

export const metadata = { title: 'Bookings' };

const ZONES = ['Africa/Lagos', 'Africa/Accra', 'Africa/Nairobi', 'Africa/Johannesburg', 'Africa/Cairo', 'Europe/London', 'Europe/Paris', 'America/New_York', 'America/Chicago', 'America/Los_Angeles', 'Asia/Dubai', 'UTC'];

export default async function Bookings({ params, searchParams }: { params: Promise<{ ws: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { ws: slug } = await params; const sp = await searchParams;
  const { supabase, ws, role } = await requireMember(slug);
  const tab = ['upcoming', 'past', 'settings'].includes(sp.tab || '') ? sp.tab! : 'upcoming';
  const now = new Date().toISOString(); const tz = ws.booking_timezone;
  const [{ data: up }, { data: past }, { data: types }] = await Promise.all([
    supabase.from('bookings').select('*').eq('workspace_id', ws.id).gte('ends_at', now).order('starts_at').limit(200),
    tab === 'past' ? supabase.from('bookings').select('*').eq('workspace_id', ws.id).lt('ends_at', now).order('starts_at', { ascending: false }).limit(100) : Promise.resolve({ data: [] }),
    supabase.from('booking_types').select('*').eq('workspace_id', ws.id).order('position').order('created_at'),
  ]);
  const upcoming = ((up || []) as Booking[]).filter((x) => x.status === 'confirmed');
  const T = (types || []) as BookingType[];
  const link = `${env.appUrl}/b/${slug}`;
  const b = `/s/${slug}/bookings`;
  const canEdit = role !== 'member';
  const list = (rows: Booking[], showCancel: boolean) => {
    let last = '';
    return rows.length ? <div className="rows">{rows.map((x) => { const day = fmtDay(x.starts_at, tz); const sep = day !== last; last = day; return (
      <div key={x.id} style={{ display: 'contents' }}>
        {sep && <p className="eyebrow" style={{ marginTop: 10 }}>{day}</p>}
        <div className="lrow">
          <span className="ftype mono" style={{ width: 'auto', padding: '0 10px' }}>{fmtTime(x.starts_at, tz)}</span>
          <div className="grow"><b>{x.name}{x.company ? ` · ${x.company}` : ''}</b><p>{x.title} · {x.email}{x.phone ? ` · ${x.phone}` : ''}</p>{x.notes && <p style={{ marginTop: 2 }}>“{x.notes.slice(0, 160)}”</p>}</div>
          {x.status === 'cancelled' ? <Chip tone="line">Cancelled</Chip> : null}
          {x.contact_id && <Link className="btn sm" href={`/s/${slug}/contacts/${x.contact_id}`}>Contact</Link>}
          {showCancel && x.status === 'confirmed' && <form action={bookingAction}><Hidden v={{ ws: slug, id: x.id, op: 'cancel' }} /><ConfirmSubmit className="btn sm ghost" confirm="Cancel and email them?">Cancel</ConfirmSubmit></form>}
        </div>
      </div>
    ); })}</div> : null;
  };
  return (
    <div className="page">
      <PageHead eyebrow="Discovery calls and meetings" title="Bookings" actions={ws.booking_enabled ? <><CopyButton text={link} label="Copy booking link" /><a className="btn primary" href={link} target="_blank" rel="noreferrer"><Icon name="eye" />View page</a></> : <Link className="btn primary" href={`${b}?tab=settings`}>Turn on booking</Link>} />
      <Tabs base={b} active={tab} items={[['upcoming', 'Upcoming', upcoming.length], ['past', 'Past'], ['settings', 'Booking page']]} />
      {tab === 'upcoming' && <Card>{list(upcoming, true) || <Empty icon="cal" title="No upcoming bookings" text={ws.booking_enabled ? 'Share your booking link on your website, Instagram bio or email signature.' : 'Turn on your booking page so new clients can pick a time for a discovery call.'} />}</Card>}
      {tab === 'past' && <Card>{list((past || []) as Booking[], false) || <Empty icon="cal" title="No past bookings" />}</Card>}
      {tab === 'settings' && <div className="split">
        <Card title="Availability" icon="clock">
          <form action={saveBookingSettings} className="col g12"><Hidden v={{ ws: slug }} />
            <div className="setrow"><div className="grow"><b>Booking page is on</b><p>Anyone with the link can book a free slot. Each booking adds a lead.</p></div><Toggle name="enabled" on={ws.booking_enabled} label="Booking page is on" /></div>
            {ws.booking_enabled && <div className="sub row"><span className="mono small ellip grow">{link}</span><CopyButton text={link} /></div>}
            <Field label="Time zone" hint={`Now showing ${tzLabel(tz)}`}><select className="sel" name="timezone" id="bs-tz" defaultValue={tz}>{(ZONES.includes(tz) ? ZONES : [tz, ...ZONES]).map((z) => <option key={z} value={z}>{z.replace(/_/g, ' ')}</option>)}</select></Field>
            <div className="col g6"><span className="small" style={{ fontWeight: 500, color: 'var(--muted)' }}>Weekly hours</span>
              {WEEKDAYS.map(([d, label]) => { const h = ws.booking_hours?.[d]; return (
                <div key={d} className="row hours"><label className="check" style={{ width: 130 }}><input type="checkbox" name={`day_${d}`} defaultChecked={!!h} /> {label}</label>
                  <input className="inp" type="time" name={`open_${d}`} defaultValue={h?.[0] || '09:00'} aria-label={`${label} opens`} /><span className="muted">to</span><input className="inp" type="time" name={`close_${d}`} defaultValue={h?.[1] || '17:00'} aria-label={`${label} closes`} /></div>
              ); })}
            </div>
            <div className="fields three">
              <Field label="Minimum notice (hours)"><input className="inp num" type="number" min={0} max={336} name="notice" id="bs-notice" defaultValue={ws.booking_notice_hours} /></Field>
              <Field label="Book up to (days ahead)"><input className="inp num" type="number" min={1} max={180} name="window" id="bs-window" defaultValue={ws.booking_window_days} /></Field>
              <Field label="Gap between (minutes)"><input className="inp num" type="number" min={0} max={240} name="buffer" id="bs-buffer" defaultValue={ws.booking_buffer_min} /></Field>
            </div>
            <Field label="Intro on your booking page"><textarea className="inp ta" name="intro" id="bs-intro" rows={2} defaultValue={ws.booking_intro} /></Field>
            {canEdit ? <div className="row"><span className="sp" /><Submit pending="Saving…">Save availability</Submit></div> : <p className="muted xs">Only owners and admins can change these.</p>}
          </form>
        </Card>
        <div className="stack">
          <Card title="Meeting types" icon="cal">
            {!T.length && <Notice tone="info" icon="info">Add at least one meeting type, like a 30-minute discovery call, so people can book.</Notice>}
            <div className="rows">{T.map((t) => (
              <details key={t.id} className="lrow" style={{ display: 'block' }}>
                <summary className="row" style={{ cursor: 'pointer', listStyle: 'none' }}><div className="grow"><b>{t.name}</b><p className="muted xs">{t.duration_min} min · {t.location}</p></div>{t.active ? <Chip tone="good">On page</Chip> : <Chip tone="line">Hidden</Chip>}</summary>
                {canEdit && <form action={bookingTypeAction} className="col g8" style={{ marginTop: 10 }}><Hidden v={{ ws: slug, id: t.id }} />
                  <div className="fields"><Field label="Name"><input className="inp" name="name" defaultValue={t.name} /></Field><Field label="Length (minutes)"><input className="inp num" type="number" min={10} max={480} step={5} name="duration" defaultValue={t.duration_min} /></Field></div>
                  <Field label="Where"><input className="inp" name="location" defaultValue={t.location} /></Field>
                  <Field label="Description" optional><textarea className="inp ta" name="description" rows={2} defaultValue={t.description} /></Field>
                  <div className="row"><Submit className="btn" pending="…" name="op" value="save">Save</Submit><span className="sp" />
                    <button className="btn ghost" name="op" value="toggle">{t.active ? 'Hide' : 'Show'}</button>
                    <button className="btn ghost" name="op" value="delete"><Icon name="trash" />Delete</button></div>
                </form>}
              </details>
            ))}</div>
          </Card>
          {canEdit && <Card title="Add a meeting type" icon="plus">
            <form action={bookingTypeAction} className="col g8"><Hidden v={{ ws: slug, op: 'create' }} />
              <div className="fields"><Field label="Name"><input className="inp" name="name" id="bt-name" required placeholder="Discovery call" /></Field><Field label="Length (minutes)"><input className="inp num" type="number" min={10} max={480} step={5} name="duration" id="bt-dur" defaultValue={30} /></Field></div>
              <Field label="Where"><input className="inp" name="location" id="bt-loc" defaultValue="Google Meet link sent by email" /></Field>
              <Field label="Description" optional><textarea className="inp ta" name="description" id="bt-desc" rows={2} placeholder="A quick call to understand your project and timeline." /></Field>
              <Submit pending="Adding…"><Icon name="plus" />Add meeting type</Submit>
            </form>
          </Card>}
        </div>
      </div>}
    </div>
  );
}
