'use server';
import { redirect } from 'next/navigation';
import { back } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { sendEmail } from '@/lib/email';
import { env } from '@/lib/env';
import { first } from '@/lib/format';
import { fmtDay, fmtTime, freeSlots, googleCalLink, tzLabel } from '@/lib/slots';
import type { BookingType, Workspace } from '@/lib/types';

const s = (fd: FormData, k: string) => String(fd.get(k) ?? '').trim();

/** Public: anyone with the link can book. Runs with the service role after validating the slot. */
export async function publicBook(fd: FormData) {
  const slug = s(fd, 'slug'), typeId = s(fd, 'type'), at = s(fd, 'at');
  const path = `/b/${slug}/${typeId}?t=${encodeURIComponent(at)}`;
  if (s(fd, 'website')) redirect(`/b/${slug}`); // honeypot
  const name = s(fd, 'name'), email = s(fd, 'email').toLowerCase();
  if (name.length < 2) back(path, undefined, 'Enter your name');
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) back(path, undefined, 'Enter a valid email so we can confirm');
  const db = createAdminClient();
  const { data: w } = await db.from('workspaces').select('*').eq('slug', slug).maybeSingle();
  const ws = w as Workspace | null;
  if (!ws || !ws.booking_enabled) redirect(`/b/${slug}`);
  const { data: t } = await db.from('booking_types').select('*').eq('id', typeId).eq('workspace_id', ws!.id).eq('active', true).maybeSingle();
  const type = t as BookingType | null;
  if (!type) redirect(`/b/${slug}`);
  const start = new Date(at); if (isNaN(start.getTime())) back(`/b/${slug}/${typeId}`, undefined, 'Pick a time');
  const end = new Date(start.getTime() + type!.duration_min * 60000);
  const { data: busy } = await db.from('bookings').select('starts_at, ends_at').eq('workspace_id', ws!.id).eq('status', 'confirmed').gte('ends_at', new Date().toISOString());
  const free = freeSlots({ tz: ws!.booking_timezone, hours: ws!.booking_hours, noticeHours: ws!.booking_notice_hours, windowDays: ws!.booking_window_days, bufferMin: ws!.booking_buffer_min }, type!.duration_min, busy || []);
  if (!free.some((d) => d.slots.includes(start.toISOString()))) back(`/b/${slug}/${typeId}`, undefined, 'Sorry, that time was just taken. Pick another.');

  // Contact: reuse by email, otherwise a new lead
  let { data: contact } = await db.from('contacts').select('id, type').eq('workspace_id', ws!.id).ilike('email', email).maybeSingle();
  let leadId: string | null = null;
  if (!contact) {
    const { data: c } = await db.from('contacts').insert({ workspace_id: ws!.id, name, email, phone: s(fd, 'phone') || null, company: s(fd, 'company') || null, type: 'lead' }).select('id, type').single();
    contact = c;
  }
  if (contact && contact.type === 'lead') {
    const { data: open } = await db.from('leads').select('id').eq('contact_id', contact.id).in('stage', ['new', 'call', 'proposal']).limit(1).maybeSingle();
    if (open) { leadId = open.id; await db.from('leads').update({ stage: 'call', next_step: `${type!.name} on ${fmtDay(start, ws!.booking_timezone)} at ${fmtTime(start, ws!.booking_timezone)}` }).eq('id', open.id).eq('stage', 'new'); }
    else {
      const { data: l } = await db.from('leads').insert({ workspace_id: ws!.id, contact_id: contact.id, service: s(fd, 'company') ? `${type!.name} (${s(fd, 'company')})` : type!.name, stage: 'call', source: 'Booking page', next_step: `${type!.name} on ${fmtDay(start, ws!.booking_timezone)} at ${fmtTime(start, ws!.booking_timezone)}`, notes: s(fd, 'notes') }).select('id').single();
      leadId = l?.id || null;
    }
  }
  const { data: bk, error } = await db.from('bookings').insert({ workspace_id: ws!.id, type_id: type!.id, contact_id: contact?.id || null, lead_id: leadId, title: type!.name, starts_at: start.toISOString(), ends_at: end.toISOString(), name, email, phone: s(fd, 'phone') || null, company: s(fd, 'company') || null, notes: s(fd, 'notes').slice(0, 2000) }).select('*').single();
  if (error || !bk) back(path, undefined, 'Could not book that time. Please try again.');
  const tz = ws!.booking_timezone;
  const when = `${fmtDay(start, tz)} at ${fmtTime(start, tz)} (${tzLabel(tz)})`;
  await db.from('activity').insert({ workspace_id: ws!.id, actor_name: name, from_client: true, kind: 'booking.created', entity_type: 'contact', entity_id: contact?.id, message: `booked ${type!.name} for ${when}` });
  await sendEmail({ to: email, subject: `Confirmed: ${type!.name} with ${ws!.name}`, heading: 'You\'re booked in', lines: [`Hi ${first(name)},`, `Your ${type!.name} with ${ws!.name} is confirmed for ${when}.`, `Where: ${type!.location}`, `Add it to your calendar: ${googleCalLink(`${type!.name} with ${ws!.name}`, bk!.starts_at, bk!.ends_at, type!.location)}`], button: { label: 'Change or cancel', url: `${env.appUrl}/b/manage/${bk!.manage_token}` }, studio: { name: ws!.name, color: ws!.brand_color }, replyTo: ws!.email || undefined });
  if (ws!.email) await sendEmail({ to: ws!.email, subject: `New booking: ${name}, ${fmtDay(start, tz)} ${fmtTime(start, tz)}`, heading: `${name} booked a ${type!.name}`, lines: [`When: ${when}`, `Email: ${email}${s(fd, 'phone') ? ` · Phone: ${s(fd, 'phone')}` : ''}`, s(fd, 'notes') ? `Notes: ${s(fd, 'notes').slice(0, 600)}` : 'No notes.'], button: { label: 'See your bookings', url: `${env.appUrl}/s/${ws!.slug}/bookings` }, studio: { name: 'Onera' } });
  redirect(`/b/manage/${bk!.manage_token}?new=1`);
}

export async function publicCancel(fd: FormData) {
  const token = s(fd, 'token'); const db = createAdminClient();
  const { data: bk } = await db.from('bookings').select('*, workspaces(*)').eq('manage_token', token).maybeSingle();
  if (!bk) redirect('/');
  if (bk.status === 'cancelled' || new Date(bk.starts_at) < new Date()) back(`/b/manage/${token}`);
  await db.from('bookings').update({ status: 'cancelled' }).eq('id', bk.id);
  const ws = bk.workspaces as Workspace; const tz = ws.booking_timezone;
  await db.from('activity').insert({ workspace_id: ws.id, actor_name: bk.name, from_client: true, kind: 'booking.cancelled', entity_type: 'contact', entity_id: bk.contact_id, message: `cancelled ${bk.title} on ${fmtDay(bk.starts_at, tz)}` });
  if (ws.email) await sendEmail({ to: ws.email, subject: `Cancelled: ${bk.name}, ${fmtDay(bk.starts_at, tz)}`, heading: `${bk.name} cancelled`, lines: [`${bk.name} cancelled their ${bk.title} on ${fmtDay(bk.starts_at, tz)} at ${fmtTime(bk.starts_at, tz)}.`, s(fd, 'reason') ? `Reason: ${s(fd, 'reason').slice(0, 600)}` : ''], button: { label: 'See your bookings', url: `${env.appUrl}/s/${ws.slug}/bookings` }, studio: { name: 'Onera' } });
  back(`/b/manage/${token}`, 'Cancelled. The studio has been told.');
}
