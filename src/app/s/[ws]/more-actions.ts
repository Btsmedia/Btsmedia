'use server';
import { redirect } from 'next/navigation';
import { requireMember, back } from '@/lib/auth';
import { logActivity, notifyClient } from '@/lib/server-helpers';
import { createAdminClient } from '@/lib/supabase/admin';
import { sendEmail } from '@/lib/email';
import { env } from '@/lib/env';
import { addDays, first, money, today } from '@/lib/format';
import { fmtDay, fmtTime, tzLabel, WEEKDAYS } from '@/lib/slots';
import type { Contact, ProposalItem } from '@/lib/types';

const s = (fd: FormData, k: string) => String(fd.get(k) ?? '').trim();
const n = (fd: FormData, k: string) => { const v = Number(fd.get(k)); return Number.isFinite(v) ? v : 0; };
const on = (fd: FormData, k: string) => fd.get(k) === 'on' || fd.get(k) === 'true';
const ctx = (fd: FormData) => requireMember(s(fd, 'ws'));
const err = (path: string, message: string): never => back(path, undefined, message);
const safeReturn = (fd: FormData, slug: string) => { const r = s(fd, 'return'); return r.startsWith(`/s/${slug}/`) ? r : `/s/${slug}/projects`; };

/* ================= proofing galleries ================= */
export async function createGallery(fd: FormData) {
  const { supabase, ws, user, name } = await ctx(fd); const pid = s(fd, 'project_id');
  const title = s(fd, 'title') || 'Round 1';
  const { data, error } = await supabase.from('galleries').insert({ workspace_id: ws.id, project_id: pid, title, note: s(fd, 'note') }).select('id').single();
  if (error) err(`/s/${ws.slug}/projects/${pid}?tab=proofing`, error.message);
  await logActivity(supabase, ws.id, user.id, name, 'gallery.created', `created the gallery "${title}"`, { type: 'project', id: pid });
  redirect(`/s/${ws.slug}/projects/${pid}/galleries/${data!.id}`);
}

export async function galleryAction(fd: FormData) {
  const { supabase, ws, user, name } = await ctx(fd); const id = s(fd, 'id'); const op = s(fd, 'op');
  const { data: g } = await supabase.from('galleries').select('*, projects(*, contacts(*))').eq('id', id).eq('workspace_id', ws.id).single();
  if (!g) err(`/s/${ws.slug}/projects`, 'Gallery not found');
  const p = g!.projects as { id: string; name: string; contacts: Contact };
  const path = `/s/${ws.slug}/projects/${p.id}/galleries/${id}`;
  if (op === 'save') { await supabase.from('galleries').update({ title: s(fd, 'title') || g!.title, note: s(fd, 'note') }).eq('id', id); back(path, 'Saved'); }
  if (op === 'share' || op === 'remind') {
    const { count } = await supabase.from('gallery_items').select('id', { count: 'exact', head: true }).eq('gallery_id', id);
    if (!count) err(path, 'Add at least one image before sharing');
    if (op === 'share') await supabase.from('galleries').update({ status: 'shared', shared_at: new Date().toISOString() }).eq('id', id);
    const c = p.contacts;
    const { link } = await notifyClient(ws, c, op === 'share' ? `${g!.title} is ready for your review` : `Reminder: ${g!.title} is waiting for your review`, op === 'share' ? 'New work to review' : 'Your review is waiting',
      [`Hi ${first(c.name)},`, `${ws.name} shared ${count} image${count === 1 ? '' : 's'} in "${g!.title}" for ${p.name}.`, 'Approve each one, or tell us what to change, right on the image.'], `/galleries/${id}`);
    await logActivity(supabase, ws.id, user.id, name, op === 'share' ? 'gallery.shared' : 'gallery.reminder', op === 'share' ? `shared "${g!.title}" with ${c.name}` : `reminded ${c.name} about "${g!.title}"`, { type: 'project', id: p.id });
    back(`${path}${link ? '?invite=' + encodeURIComponent(link) : ''}`, op === 'share' ? `Shared with ${c.name}` : 'Reminder sent');
  }
  if (op === 'unshare') { await supabase.from('galleries').update({ status: 'draft' }).eq('id', id); back(path, 'Hidden from the client'); }
  if (op === 'delete') {
    const { data: items } = await supabase.from('gallery_items').select('path').eq('gallery_id', id);
    if (items?.length) await createAdminClient().storage.from('files').remove(items.map((i) => i.path));
    await supabase.from('galleries').delete().eq('id', id);
    back(`/s/${ws.slug}/projects/${p.id}?tab=proofing`, 'Gallery deleted');
  }
  back(path);
}

export async function proofItemAction(fd: FormData) {
  const { supabase, ws } = await ctx(fd); const id = s(fd, 'id'); const op = s(fd, 'op'); const path = safeReturn(fd, ws.slug);
  const { data: it } = await supabase.from('gallery_items').select('*').eq('id', id).eq('workspace_id', ws.id).single();
  if (!it) err(path, 'Image not found');
  if (op === 'delete') { await createAdminClient().storage.from('files').remove([it!.path]); await supabase.from('gallery_items').delete().eq('id', id); back(path, 'Image removed'); }
  if (op === 'reset') { await supabase.from('gallery_items').update({ status: 'pending', decided_at: null }).eq('id', id); await supabase.from('galleries').update({ status: 'shared', approved_at: null }).eq('id', it!.gallery_id).eq('status', 'approved'); back(path, 'Marked for review again'); }
  back(path);
}

export async function proofReply(fd: FormData) {
  const { supabase, ws, user, name } = await ctx(fd); const path = safeReturn(fd, ws.slug); const body = s(fd, 'body');
  if (!body) back(path);
  const { error } = await supabase.from('proof_comments').insert({ workspace_id: ws.id, item_id: s(fd, 'item_id'), author_id: user.id, author_name: name, from_client: false, body: body.slice(0, 2000) });
  back(path, error ? undefined : 'Reply added', error?.message);
}

/* ================= proposals ================= */
export async function createProposal(fd: FormData) {
  const { supabase, ws, user, name } = await ctx(fd);
  let contactId = s(fd, 'contact_id'); const leadId = s(fd, 'lead_id') || null;
  let service = s(fd, 'service'); let value = 0;
  if (leadId) {
    const { data: l } = await supabase.from('leads').select('*').eq('id', leadId).eq('workspace_id', ws.id).single();
    if (l) { contactId = l.contact_id; service = service || l.service; value = Number(l.value) || 0; }
  }
  if (!contactId) err(`/s/${ws.slug}/proposals?new=1`, 'Choose who the proposal is for');
  const { data: num, error: nerr } = await supabase.rpc('next_number', { p_ws: ws.id, p_kind: 'quote' });
  if (nerr) err(`/s/${ws.slug}/proposals`, nerr.message);
  const { data: tpl } = await supabase.from('contract_templates').select('id').eq('workspace_id', ws.id).order('created_at').limit(1).maybeSingle();
  const title = s(fd, 'title') || (service ? `${service} proposal` : 'Proposal');
  const { data: q, error } = await supabase.from('proposals').insert({ workspace_id: ws.id, contact_id: contactId, lead_id: leadId, number: num, title, service, template_id: tpl?.id || null, valid_until: addDays(today(), 14) }).select('id').single();
  if (error) err(`/s/${ws.slug}/proposals`, error.message);
  await supabase.from('proposal_items').insert({ workspace_id: ws.id, proposal_id: q!.id, description: service || 'Project fee', qty: 1, rate: value, position: 0 });
  if (leadId) await supabase.from('leads').update({ stage: 'proposal' }).eq('id', leadId).in('stage', ['new', 'call']);
  await logActivity(supabase, ws.id, user.id, name, 'proposal.created', `drafted ${num}`, { type: 'proposal', id: q!.id });
  redirect(`/s/${ws.slug}/proposals/${q!.id}`);
}

export async function saveProposal(fd: FormData) {
  const { supabase, ws } = await ctx(fd); const id = s(fd, 'id'); const path = `/s/${ws.slug}/proposals/${id}`;
  const { data: q } = await supabase.from('proposals').select('status').eq('id', id).eq('workspace_id', ws.id).single();
  if (!q) err(`/s/${ws.slug}/proposals`, 'Proposal not found');
  if (q!.status !== 'draft') err(path, 'Only drafts can be edited. Withdraw it first to make changes.');
  let items: ProposalItem[] = [];
  try { items = (JSON.parse(s(fd, 'items') || '[]') as ProposalItem[]).filter((i) => i.description || Number(i.rate)); } catch { err(path, 'Could not read the line items'); }
  const { error } = await supabase.from('proposals').update({
    title: s(fd, 'title') || 'Proposal', intro: s(fd, 'intro'), service: s(fd, 'service'), vat: on(fd, 'vat'),
    deposit_pct: Math.max(0, Math.min(100, Math.round(n(fd, 'deposit_pct')))), valid_until: s(fd, 'valid_until') || null, template_id: s(fd, 'template_id') || null,
  }).eq('id', id);
  if (error) err(path, error.message);
  await supabase.from('proposal_items').delete().eq('proposal_id', id);
  if (items.length) await supabase.from('proposal_items').insert(items.map((it, i) => ({ workspace_id: ws.id, proposal_id: id, description: String(it.description || '').slice(0, 300), detail: String(it.detail || '').slice(0, 1000), qty: Number(it.qty) || 0, rate: Number(it.rate) || 0, position: i })));
  if (s(fd, 'then') === 'send') return sendProposalInner(fd, id);
  back(path, 'Draft saved');
}

async function sendProposalInner(fd: FormData, id: string) {
  const { supabase, ws, user, name } = await ctx(fd); const path = `/s/${ws.slug}/proposals/${id}`;
  const { data: q } = await supabase.from('proposals').select('*, contacts(*), proposal_items(*)').eq('id', id).single();
  const c = q!.contacts as Contact; const items = (q!.proposal_items || []) as ProposalItem[];
  const total = items.reduce((t, it) => t + Number(it.qty) * Number(it.rate), 0);
  if (!c.email) err(path, `Add an email for ${c.name} before sending`);
  if (total <= 0) err(path, 'Add at least one line with a price before sending');
  await supabase.from('proposals').update({ status: 'sent', sent_at: new Date().toISOString(), sent_by_name: name }).eq('id', id);
  const { link } = await notifyClient(ws, c, `${q!.title} from ${ws.name}`, `A proposal from ${ws.name}`, [`Hi ${first(c.name)},`, `Here's our proposal for ${q!.service || 'your project'}: ${money(total, ws.currency)}${q!.vat ? ' plus VAT' : ''}.`, 'Read it in your portal. If it looks right, accept it there and we\'ll send the agreement and deposit invoice straight away.'], `/proposals/${id}`);
  await logActivity(supabase, ws.id, user.id, name, 'proposal.sent', `sent ${q!.number} to ${c.name}`, { type: 'proposal', id });
  back(`${path}${link ? '?invite=' + encodeURIComponent(link) : ''}`, `Sent to ${c.email}`);
}

export async function proposalAction(fd: FormData) {
  const { supabase, ws, user, name } = await ctx(fd); const id = s(fd, 'id'); const op = s(fd, 'op'); const path = `/s/${ws.slug}/proposals/${id}`;
  const { data: q } = await supabase.from('proposals').select('*, contacts(*), proposal_items(*)').eq('id', id).eq('workspace_id', ws.id).single();
  if (!q) err(`/s/${ws.slug}/proposals`, 'Proposal not found');
  if (op === 'withdraw') { if (q!.status !== 'sent') err(path, 'Only sent proposals can be withdrawn'); await supabase.from('proposals').update({ status: 'draft', sent_at: null }).eq('id', id); back(path, 'Back to draft. The client can no longer see it.'); }
  if (op === 'remind') {
    const c = q!.contacts as Contact;
    await notifyClient(ws, c, `Reminder: ${q!.title}`, 'Your proposal is waiting', [`Hi ${first(c.name)},`, `Just checking you saw our proposal "${q!.title}". It's in your portal whenever you're ready.`], `/proposals/${id}`);
    await logActivity(supabase, ws.id, user.id, name, 'proposal.reminder', `reminded ${c.name} about ${q!.number}`, { type: 'proposal', id });
    back(path, 'Reminder sent');
  }
  if (op === 'delete') { if (q!.status === 'accepted') err(path, 'Accepted proposals are kept for your records'); await supabase.from('proposals').delete().eq('id', id); back(`/s/${ws.slug}/proposals`, 'Proposal deleted'); }
  if (op === 'duplicate') {
    const { data: num } = await supabase.rpc('next_number', { p_ws: ws.id, p_kind: 'quote' });
    const { data: copy, error } = await supabase.from('proposals').insert({ workspace_id: ws.id, contact_id: q!.contact_id, lead_id: q!.lead_id, number: num, title: q!.title, intro: q!.intro, service: q!.service, vat: q!.vat, deposit_pct: q!.deposit_pct, template_id: q!.template_id, valid_until: addDays(today(), 14) }).select('id').single();
    if (error) err(path, error.message);
    const items = (q!.proposal_items || []) as ProposalItem[];
    if (items.length) await supabase.from('proposal_items').insert(items.map((it, i) => ({ workspace_id: ws.id, proposal_id: copy!.id, description: it.description, detail: it.detail || '', qty: it.qty, rate: it.rate, position: i })));
    redirect(`/s/${ws.slug}/proposals/${copy!.id}`);
  }
  back(path);
}

/* ================= booking ================= */
export async function saveBookingSettings(fd: FormData) {
  const { supabase, ws, role } = await ctx(fd); const path = `/s/${ws.slug}/bookings?tab=settings`;
  if (role === 'member') err(path, 'Only owners and admins can change booking settings');
  const hours: Record<string, [string, string]> = {};
  for (const [d] of WEEKDAYS) {
    if (!on(fd, `day_${d}`)) continue;
    const a = s(fd, `open_${d}`), b = s(fd, `close_${d}`);
    if (!/^\d\d:\d\d$/.test(a) || !/^\d\d:\d\d$/.test(b) || a >= b) err(path, 'Check your opening hours: each open day needs a start time before its end time');
    hours[d] = [a, b];
  }
  const tz = s(fd, 'timezone') || 'Africa/Lagos';
  try { new Intl.DateTimeFormat('en', { timeZone: tz }); } catch { err(path, 'Unknown time zone'); }
  const { error } = await supabase.from('workspaces').update({
    booking_enabled: on(fd, 'enabled'), booking_timezone: tz, booking_hours: hours,
    booking_notice_hours: Math.max(0, Math.min(336, Math.round(n(fd, 'notice')))), booking_window_days: Math.max(1, Math.min(180, Math.round(n(fd, 'window')))),
    booking_buffer_min: Math.max(0, Math.min(240, Math.round(n(fd, 'buffer')))), booking_intro: s(fd, 'intro') || ws.booking_intro,
  }).eq('id', ws.id);
  back(path, error ? undefined : 'Booking settings saved', error?.message);
}

export async function bookingTypeAction(fd: FormData) {
  const { supabase, ws, role } = await ctx(fd); const op = s(fd, 'op'); const id = s(fd, 'id'); const path = `/s/${ws.slug}/bookings?tab=settings`;
  if (role === 'member') err(path, 'Only owners and admins can change meeting types');
  if (op === 'create' || op === 'save') {
    const row = { name: s(fd, 'name'), description: s(fd, 'description'), duration_min: Math.max(10, Math.min(480, Math.round(n(fd, 'duration')) || 30)), location: s(fd, 'location') || 'Google Meet link sent by email' };
    if (row.name.length < 2) err(path, 'Give the meeting a name');
    const { error } = op === 'create' ? await supabase.from('booking_types').insert({ ...row, workspace_id: ws.id }) : await supabase.from('booking_types').update(row).eq('id', id).eq('workspace_id', ws.id);
    back(path, error ? undefined : 'Meeting type saved', error?.message);
  }
  if (op === 'toggle') { const { data: t } = await supabase.from('booking_types').select('active').eq('id', id).single(); await supabase.from('booking_types').update({ active: !t?.active }).eq('id', id); back(path, t?.active ? 'Hidden from your booking page' : 'Shown on your booking page'); }
  if (op === 'delete') { await supabase.from('booking_types').delete().eq('id', id).eq('workspace_id', ws.id); back(path, 'Meeting type deleted'); }
  back(path);
}

export async function bookingAction(fd: FormData) {
  const { supabase, ws, user, name } = await ctx(fd); const id = s(fd, 'id'); const op = s(fd, 'op'); const path = `/s/${ws.slug}/bookings`;
  const { data: bk } = await supabase.from('bookings').select('*').eq('id', id).eq('workspace_id', ws.id).single();
  if (!bk) err(path, 'Booking not found');
  if (op === 'cancel') {
    await supabase.from('bookings').update({ status: 'cancelled' }).eq('id', id);
    const tz = ws.booking_timezone;
    await sendEmail({ to: bk!.email, subject: `Cancelled: ${bk!.title} with ${ws.name}`, heading: 'Your meeting was cancelled', lines: [`Hi ${first(bk!.name)},`, `${ws.name} had to cancel your ${bk!.title} on ${fmtDay(bk!.starts_at, tz)} at ${fmtTime(bk!.starts_at, tz)} (${tzLabel(tz)}).`, s(fd, 'reason') || 'Sorry for the change. Pick another time that suits you.'], button: ws.booking_enabled ? { label: 'Book another time', url: `${env.appUrl}/b/${ws.slug}` } : undefined, studio: { name: ws.name, color: ws.brand_color }, replyTo: ws.email || undefined });
    await logActivity(supabase, ws.id, user.id, name, 'booking.cancelled', `cancelled ${bk!.title} with ${bk!.name}`, { type: 'contact', id: bk!.contact_id || id });
    back(path, 'Booking cancelled and the guest was emailed');
  }
  back(path);
}

/* ================= settings: automations + logo ================= */
export async function saveAutomations(fd: FormData) {
  const { supabase, ws, role } = await ctx(fd); const path = `/s/${ws.slug}/settings?tab=automations`;
  if (role === 'member') err(path, 'Only owners and admins can change automations');
  const { error } = await supabase.from('workspaces').update({ auto_invoice_reminders: on(fd, 'auto_invoice_reminders'), auto_contract_reminders: on(fd, 'auto_contract_reminders'), auto_send_on_sign: on(fd, 'auto_send_on_sign'), auto_booking_reminders: on(fd, 'auto_booking_reminders') }).eq('id', ws.id);
  back(path, error ? undefined : 'Automations saved', error?.message);
}

export async function uploadLogo(fd: FormData) {
  const { ws, role } = await ctx(fd); const path = `/s/${ws.slug}/settings?tab=studio`;
  if (role === 'member') err(path, 'Only owners and admins can change the logo');
  if (s(fd, 'op') === 'remove') { await createAdminClient().from('workspaces').update({ logo_path: null }).eq('id', ws.id); back(path, 'Logo removed'); }
  const file = fd.get('logo');
  if (!(file instanceof File) || !file.size) err(path, 'Choose an image first');
  const f = file as File;
  if (!['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'].includes(f.type)) err(path, 'Use a PNG, JPG, WebP or SVG');
  if (f.size > 1.5 * 1024 * 1024) err(path, 'Logos can be up to 1.5 MB');
  const ext = f.type === 'image/svg+xml' ? 'svg' : f.type.split('/')[1].replace('jpeg', 'jpg');
  const key = `${ws.id}/logo-${Date.now()}.${ext}`;
  const admin = createAdminClient();
  const { error } = await admin.storage.from('logos').upload(key, f, { contentType: f.type, upsert: true });
  if (error) err(path, 'Upload failed: ' + error.message);
  const url = admin.storage.from('logos').getPublicUrl(key).data.publicUrl;
  await admin.from('workspaces').update({ logo_path: url }).eq('id', ws.id);
  back(path, 'Logo updated');
}
