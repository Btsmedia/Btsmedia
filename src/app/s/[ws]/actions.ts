'use server';
import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { requireMember, back } from '@/lib/auth';
import { logActivity, notifyClient, portalInviteLink } from '@/lib/server-helpers';
import { createAdminClient } from '@/lib/supabase/admin';
import { sendEmail } from '@/lib/email';
import { env, portalUrl } from '@/lib/env';
import { addDays, first, money, today } from '@/lib/format';
import { PLANS, platformFeePct, type PlanKey } from '@/lib/plans';
import { fillSections } from '@/lib/vars';
import { createSubaccount, initializeTransaction, resolveAccount } from '@/lib/paystack';
import type { Contact, InvoiceItem, Project, Section, Workspace } from '@/lib/types';
import { totalOf } from '@/lib/data';

const s = (fd: FormData, k: string) => String(fd.get(k) ?? '').trim();
const n = (fd: FormData, k: string) => { const v = Number(fd.get(k)); return Number.isFinite(v) ? v : 0; };
const on = (fd: FormData, k: string) => fd.get(k) === 'on' || fd.get(k) === 'true';
const ctx = (fd: FormData) => requireMember(s(fd, 'ws'));
const ret = (fd: FormData, fallback: string) => { const r = s(fd, 'return'); return r.startsWith('/') ? r : fallback; };
const err = (path: string, message: string): never => back(path, undefined, message);

/* ================= contacts ================= */
export async function createContact(fd: FormData) {
  const { supabase, ws, user, name } = await ctx(fd);
  const row = { workspace_id: ws.id, name: s(fd, 'name'), company: s(fd, 'company') || null, email: s(fd, 'email').toLowerCase() || null, phone: s(fd, 'phone') || null, city: s(fd, 'city') || null, role: s(fd, 'role') || null, type: (s(fd, 'type') || 'client') as Contact['type'] };
  if (!row.name) err(`/s/${ws.slug}/contacts?new=1`, 'Enter a name');
  const { data, error } = await supabase.from('contacts').insert(row).select('id').single();
  if (error) err(`/s/${ws.slug}/contacts?new=1`, error.code === '23505' ? 'A contact with that email already exists' : error.message);
  await logActivity(supabase, ws.id, user.id, name, 'contact.created', `added ${row.name}`, { type: 'contact', id: data!.id });
  back(`/s/${ws.slug}/contacts/${data!.id}`, 'Contact added');
}

export async function updateContact(fd: FormData) {
  const { supabase, ws } = await ctx(fd); const id = s(fd, 'id');
  const tags = s(fd, 'tags').split(',').map((t) => t.trim()).filter(Boolean);
  const { error } = await supabase.from('contacts').update({ name: s(fd, 'name'), company: s(fd, 'company') || null, role: s(fd, 'role') || null, email: s(fd, 'email').toLowerCase() || null, phone: s(fd, 'phone') || null, city: s(fd, 'city') || null, type: s(fd, 'type') || 'client', tags, notes: s(fd, 'notes') }).eq('id', id).eq('workspace_id', ws.id);
  if (error) err(`/s/${ws.slug}/contacts/${id}`, error.code === '23505' ? 'Another contact already uses that email' : error.message);
  back(`/s/${ws.slug}/contacts/${id}`, 'Saved');
}

export async function inviteToPortal(fd: FormData) {
  const { supabase, ws, user, name } = await ctx(fd); const id = s(fd, 'id');
  const { data: c } = await supabase.from('contacts').select('*').eq('id', id).eq('workspace_id', ws.id).single();
  if (!c?.email) err(ret(fd, `/s/${ws.slug}/contacts/${id}`), 'Add an email address to this contact first');
  let link = '';
  try { link = await portalInviteLink(ws, c as Contact); } catch (e) { err(ret(fd, `/s/${ws.slug}/contacts/${id}`), (e as Error).message); }
  const { sent } = await sendEmail({ to: c!.email, subject: `${ws.name} invited you to your client portal`, heading: `Your portal with ${ws.name}`, lines: [`Hi ${first(c!.name)},`, `${ws.name} uses a client portal for your project. You can sign agreements, pay invoices, share files and message the team there.`, 'The button below signs you in. It works once and expires in 24 hours.'], button: { label: 'Open your portal', url: link }, studio: { name: ws.name, color: ws.brand_color }, replyTo: ws.email || undefined });
  await logActivity(supabase, ws.id, user.id, name, 'portal.invited', `invited ${c!.name} to the portal`, { type: 'contact', id });
  const base = ret(fd, `/s/${ws.slug}/contacts/${id}`);
  back(sent ? base : `${base}${base.includes('?') ? '&' : '?'}invite=${encodeURIComponent(link)}`, sent ? `Invite emailed to ${c!.email}` : 'Invite link created. Email is not set up, so copy the link below.');
}

/* ================= leads ================= */
export async function createLead(fd: FormData) {
  const { supabase, ws, user, name } = await ctx(fd);
  let contactId = s(fd, 'contact_id');
  if (!contactId) {
    if (!s(fd, 'name')) err(`/s/${ws.slug}/leads?new=1`, 'Enter the person\'s name');
    const { data: c, error } = await supabase.from('contacts').insert({ workspace_id: ws.id, name: s(fd, 'name'), company: s(fd, 'company') || null, email: s(fd, 'email').toLowerCase() || null, phone: s(fd, 'phone') || null, type: 'lead' }).select('id').single();
    if (error) err(`/s/${ws.slug}/leads?new=1`, error.code === '23505' ? 'A contact with that email already exists. Pick them from the list instead.' : error.message);
    contactId = c!.id;
  }
  const { data: l, error } = await supabase.from('leads').insert({ workspace_id: ws.id, contact_id: contactId, service: s(fd, 'service') || 'Brand identity', value: n(fd, 'value'), source: s(fd, 'source') || 'Other', next_step: s(fd, 'next_step') }).select('id').single();
  if (error) err(`/s/${ws.slug}/leads?new=1`, error.message);
  await logActivity(supabase, ws.id, user.id, name, 'lead.created', `added a lead (${s(fd, 'company') || s(fd, 'name')})`, { type: 'lead', id: l!.id });
  back(`/s/${ws.slug}/leads/${l!.id}`, 'Lead added');
}

export async function updateLead(fd: FormData) {
  const { supabase, ws } = await ctx(fd); const id = s(fd, 'id');
  const patch: Record<string, unknown> = {};
  for (const k of ['service', 'source', 'next_step', 'notes', 'stage']) if (fd.has(k)) patch[k] = s(fd, k);
  if (fd.has('value')) patch.value = n(fd, 'value');
  const { error } = await supabase.from('leads').update(patch).eq('id', id).eq('workspace_id', ws.id);
  if (error) err(ret(fd, `/s/${ws.slug}/leads/${id}`), error.message);
  back(ret(fd, `/s/${ws.slug}/leads/${id}`), fd.has('stage') ? 'Lead moved' : 'Saved');
}

/** Creates the project (and optionally a contract draft, deposit invoice draft and portal invite) from a lead. */
export async function convertLead(fd: FormData) {
  const { supabase, ws, user, name } = await ctx(fd); const id = s(fd, 'id');
  const { data: lead } = await supabase.from('leads').select('*, contacts(*)').eq('id', id).eq('workspace_id', ws.id).single();
  if (!lead) err(`/s/${ws.slug}/leads`, 'Lead not found');
  await enforceProjectLimit(supabase, ws);
  const contact = lead!.contacts as Contact;
  const project = await insertProject(supabase, ws, { contact_id: contact.id, name: s(fd, 'project_name') || `${contact.company || contact.name} ${lead!.service.toLowerCase()}`, service: lead!.service, value: Number(lead!.value), start_date: s(fd, 'start') || today(), due_date: s(fd, 'due') || addDays(s(fd, 'start') || today(), 28) });
  await supabase.from('contacts').update({ type: 'client' }).eq('id', contact.id);
  await supabase.from('leads').update({ stage: 'won', project_id: project.id }).eq('id', id);
  if (on(fd, 'contract')) await insertContract(supabase, ws, project, contact, null);
  if (on(fd, 'invoice') && project.value > 0) {
    const number = (await supabase.rpc('next_number', { p_ws: ws.id, p_kind: 'invoice' })).data as string;
    const { data: inv } = await supabase.from('invoices').insert({ workspace_id: ws.id, contact_id: contact.id, project_id: project.id, number, title: 'Deposit (40%)', due_on: addDays(project.start_date, 3), pass_fees: ws.pass_card_fees }).select('id').single();
    if (inv) await supabase.from('invoice_items').insert({ invoice_id: inv.id, workspace_id: ws.id, description: `${project.name} · deposit`, qty: 1, rate: Math.round(project.value * 0.4) });
  }
  if (on(fd, 'invite') && contact.email) { try { await portalInviteLink(ws, contact); } catch { /* shown on the contact page */ } }
  await logActivity(supabase, ws.id, user.id, name, 'lead.won', `won ${contact.company || contact.name} and created ${project.name}`, { type: 'project', id: project.id });
  back(`/s/${ws.slug}/projects/${project.id}`, 'Project created from the lead');
}

/* ================= projects ================= */
async function enforceProjectLimit(supabase: Awaited<ReturnType<typeof requireMember>>['supabase'], ws: Workspace) {
  const limit = PLANS[ws.plan as PlanKey]?.activeProjects ?? 3;
  const trialing = ws.plan_status === 'trialing' && new Date(ws.trial_ends_at) > new Date();
  if (limit === Infinity || trialing) return;
  const { count } = await supabase.from('projects').select('id', { count: 'exact', head: true }).eq('workspace_id', ws.id).eq('status', 'active');
  if ((count || 0) >= limit) err(`/s/${ws.slug}/settings?tab=billing`, `The ${PLANS[ws.plan as PlanKey].name} plan includes ${limit} active projects. Upgrade or complete a project to add another.`);
}

const STANDARD_TASKS: Record<string, [string, number, boolean][]> = {
  default: [['Kickoff call and brief sign-off', 0, false], ['Send brief questionnaire answers', 2, true], ['First concepts', 14, false], ['Feedback on concepts', 17, true], ['Refine chosen direction', 21, false], ['Final files and handoff', 28, false]],
  website: [['Sitemap and content plan', 5, false], ['Send copy and photography', 12, true], ['Homepage design', 21, false], ['Inner pages', 28, false], ['Build', 42, false], ['Review on staging', 45, true], ['Launch', 49, false]],
};

async function insertProject(supabase: Awaited<ReturnType<typeof requireMember>>['supabase'], ws: Workspace, p: { contact_id: string; name: string; service: string; value: number; start_date: string; due_date: string }) {
  const code = (await supabase.rpc('next_number', { p_ws: ws.id, p_kind: 'project' })).data as string;
  const stages = /web/i.test(p.service) ? ['Discovery', 'Design', 'Build', 'Launch'] : ['Discovery', 'Concepts', 'Refine', 'Handoff'];
  const { data, error } = await supabase.from('projects').insert({ workspace_id: ws.id, ...p, code: code.replace('PRO-', 'P-'), stages, show_plan: ws.portal_show_plan }).select('*').single();
  if (error) throw new Error(error.message);
  const tpl = /web/i.test(p.service) ? STANDARD_TASKS.website : STANDARD_TASKS.default;
  await supabase.from('tasks').insert(tpl.map(([title, d, client], i) => ({ workspace_id: ws.id, project_id: data.id, title, due_date: addDays(p.start_date, d), for_client: client, position: i })));
  return data as Project;
}

export async function createProject(fd: FormData) {
  const { supabase, ws, user, name } = await ctx(fd);
  if (!s(fd, 'contact_id')) err(`/s/${ws.slug}/projects?new=1`, 'Choose a client');
  if (s(fd, 'name').length < 2) err(`/s/${ws.slug}/projects?new=1`, 'Give the project a name');
  await enforceProjectLimit(supabase, ws);
  const start = s(fd, 'start') || today();
  const p = await insertProject(supabase, ws, { contact_id: s(fd, 'contact_id'), name: s(fd, 'name'), service: s(fd, 'service') || 'Brand identity', value: n(fd, 'value'), start_date: start, due_date: s(fd, 'due') || addDays(start, 28) });
  await logActivity(supabase, ws.id, user.id, name, 'project.created', `created ${p.name}`, { type: 'project', id: p.id });
  back(`/s/${ws.slug}/projects/${p.id}`, 'Project created with a starter task list');
}

export async function updateProject(fd: FormData) {
  const { supabase, ws } = await ctx(fd); const id = s(fd, 'id');
  const patch: Record<string, unknown> = { name: s(fd, 'name'), summary: s(fd, 'summary'), service: s(fd, 'service'), value: n(fd, 'value'), start_date: s(fd, 'start_date'), due_date: s(fd, 'due_date') || null, show_plan: on(fd, 'show_plan') };
  const stages = s(fd, 'stages').split(',').map((x) => x.trim()).filter(Boolean);
  if (stages.length >= 2) patch.stages = stages;
  const { error } = await supabase.from('projects').update(patch).eq('id', id).eq('workspace_id', ws.id);
  if (error) err(`/s/${ws.slug}/projects/${id}`, error.message);
  back(`/s/${ws.slug}/projects/${id}`, 'Project saved');
}

export async function moveStage(fd: FormData) {
  const { supabase, ws, user, name } = await ctx(fd); const id = s(fd, 'id'); const dir = n(fd, 'dir');
  const { data: p } = await supabase.from('projects').select('*').eq('id', id).eq('workspace_id', ws.id).single();
  if (!p) err(`/s/${ws.slug}/projects`, 'Project not found');
  if (dir > 0 && p!.stage >= p!.stages.length - 1) {
    await supabase.from('projects').update({ status: 'completed', stage: p!.stages.length }).eq('id', id);
    await logActivity(supabase, ws.id, user.id, name, 'project.completed', `completed ${p!.name}`, { type: 'project', id });
    back(`/s/${ws.slug}/projects/${id}`, 'Project marked complete');
  }
  const stage = Math.max(0, Math.min(p!.stages.length - 1, p!.stage + dir));
  await supabase.from('projects').update({ stage, status: 'active' }).eq('id', id);
  await logActivity(supabase, ws.id, user.id, name, 'project.stage', `moved ${p!.name} to ${p!.stages[stage]}`, { type: 'project', id });
  back(`/s/${ws.slug}/projects/${id}`, `Moved to ${p!.stages[stage]}`);
}

export async function addTask(fd: FormData) {
  const { supabase, ws } = await ctx(fd); const pid = s(fd, 'project_id');
  if (!s(fd, 'title')) err(`/s/${ws.slug}/projects/${pid}?tab=tasks`, 'Type a task first');
  const { count } = await supabase.from('tasks').select('id', { count: 'exact', head: true }).eq('project_id', pid);
  await supabase.from('tasks').insert({ workspace_id: ws.id, project_id: pid, title: s(fd, 'title'), due_date: s(fd, 'due_date') || null, for_client: on(fd, 'for_client'), position: count || 0 });
  back(`/s/${ws.slug}/projects/${pid}?tab=tasks`);
}
export async function updateTask(fd: FormData) {
  const { supabase, ws } = await ctx(fd); const id = s(fd, 'id'); const op = s(fd, 'op'); const pid = s(fd, 'project_id');
  const { data: t } = await supabase.from('tasks').select('*').eq('id', id).eq('workspace_id', ws.id).single();
  if (!t) err(`/s/${ws.slug}/projects/${pid}?tab=tasks`, 'Task not found');
  if (op === 'done') await supabase.from('tasks').update({ done: !t!.done, done_at: t!.done ? null : new Date().toISOString() }).eq('id', id);
  if (op === 'visible') await supabase.from('tasks').update({ visible: !t!.visible }).eq('id', id);
  if (op === 'client') await supabase.from('tasks').update({ for_client: !t!.for_client }).eq('id', id);
  if (op === 'delete') await supabase.from('tasks').delete().eq('id', id);
  if (op === 'due') await supabase.from('tasks').update({ due_date: s(fd, 'due_date') || null }).eq('id', id);
  back(`/s/${ws.slug}/projects/${pid}?tab=tasks`);
}

export async function addNote(fd: FormData) {
  const { supabase, ws, user } = await ctx(fd); const pid = s(fd, 'project_id');
  if (!s(fd, 'body')) err(`/s/${ws.slug}/projects/${pid}?tab=notes`, 'Write something first');
  await supabase.from('notes').insert({ workspace_id: ws.id, project_id: pid, author_id: user.id, body: s(fd, 'body'), shared: on(fd, 'shared') });
  back(`/s/${ws.slug}/projects/${pid}?tab=notes`, 'Note added');
}
export async function updateNote(fd: FormData) {
  const { supabase, ws } = await ctx(fd); const id = s(fd, 'id'); const pid = s(fd, 'project_id');
  if (s(fd, 'op') === 'delete') await supabase.from('notes').delete().eq('id', id).eq('workspace_id', ws.id);
  else { const { data } = await supabase.from('notes').select('shared').eq('id', id).single(); await supabase.from('notes').update({ shared: !data?.shared }).eq('id', id); }
  back(`/s/${ws.slug}/projects/${pid}?tab=notes`);
}
export async function updateFile(fd: FormData) {
  const { supabase, ws } = await ctx(fd); const id = s(fd, 'id'); const pid = s(fd, 'project_id');
  const { data: f } = await supabase.from('files').select('*').eq('id', id).eq('workspace_id', ws.id).single();
  if (!f) err(`/s/${ws.slug}/projects/${pid}?tab=files`, 'File not found');
  if (s(fd, 'op') === 'delete') { await createAdminClient().storage.from('files').remove([f!.path]); await supabase.from('files').delete().eq('id', id); back(`/s/${ws.slug}/projects/${pid}?tab=files`, 'File deleted'); }
  await supabase.from('files').update({ shared: !f!.shared }).eq('id', id);
  back(`/s/${ws.slug}/projects/${pid}?tab=files`, f!.shared ? 'Hidden from the client' : 'Shared with the client');
}

/* ================= invoices ================= */
export async function createInvoice(fd: FormData) {
  const { supabase, ws } = await ctx(fd);
  let contactId = s(fd, 'contact_id'); const projectId = s(fd, 'project_id') || null;
  if (projectId && !contactId) { const { data: p } = await supabase.from('projects').select('contact_id').eq('id', projectId).single(); contactId = p?.contact_id; }
  if (!contactId) err(`/s/${ws.slug}/invoices?new=1`, 'Choose who the invoice is for');
  const number = (await supabase.rpc('next_number', { p_ws: ws.id, p_kind: 'invoice' })).data as string;
  const { data, error } = await supabase.from('invoices').insert({ workspace_id: ws.id, contact_id: contactId, project_id: projectId, number, title: s(fd, 'title') || 'Invoice', due_on: addDays(today(), ws.payment_terms_days), pass_fees: ws.pass_card_fees }).select('id').single();
  if (error) err(`/s/${ws.slug}/invoices`, error.message);
  await supabase.from('invoice_items').insert({ invoice_id: data!.id, workspace_id: ws.id, description: '', qty: 1, rate: 0 });
  redirect(`/s/${ws.slug}/invoices/${data!.id}`);
}

/** Saves the editor. Items arrive as JSON so rows can be added and removed on the client. */
export async function saveInvoice(fd: FormData) {
  const { supabase, ws } = await ctx(fd); const id = s(fd, 'id');
  const { data: inv } = await supabase.from('invoices').select('status').eq('id', id).eq('workspace_id', ws.id).single();
  if (!inv) err(`/s/${ws.slug}/invoices`, 'Invoice not found');
  if (inv!.status !== 'draft') err(`/s/${ws.slug}/invoices/${id}`, 'Only drafts can be edited. Void it and send a new one instead.');
  let items: InvoiceItem[] = [];
  try { items = JSON.parse(s(fd, 'items') || '[]'); } catch { err(`/s/${ws.slug}/invoices/${id}`, 'Line items could not be read'); }
  items = items.filter((i) => i.description?.trim() || Number(i.rate) > 0).slice(0, 100);
  await supabase.from('invoices').update({ title: s(fd, 'title') || 'Invoice', contact_id: s(fd, 'contact_id'), project_id: s(fd, 'project_id') || null, due_on: s(fd, 'due_on') || addDays(today(), 7), vat: on(fd, 'vat'), pass_fees: on(fd, 'pass_fees'), notes: s(fd, 'notes') }).eq('id', id);
  await supabase.from('invoice_items').delete().eq('invoice_id', id);
  if (items.length) await supabase.from('invoice_items').insert(items.map((i, k) => ({ invoice_id: id, workspace_id: ws.id, description: String(i.description).slice(0, 300), qty: Math.max(0, Number(i.qty) || 0), rate: Math.max(0, Number(i.rate) || 0), position: k })));
  if (s(fd, 'then') === 'send') return sendInvoiceInner(id, ws.slug);
  back(`/s/${ws.slug}/invoices/${id}`, 'Draft saved');
}

async function sendInvoiceInner(id: string, slug: string) {
  const { supabase, ws, user, name } = await requireMember(slug);
  const { data: inv } = await supabase.from('invoices').select('*, contacts(*)').eq('id', id).eq('workspace_id', ws.id).single();
  if (!inv) err(`/s/${slug}/invoices`, 'Invoice not found');
  const tot = await totalOf(supabase, id);
  const c = inv!.contacts as Contact;
  if (!c.email) err(`/s/${slug}/invoices/${id}`, `Add an email for ${c.name} before sending`);
  if (!tot || Number(tot.total) <= 0) err(`/s/${slug}/invoices/${id}`, 'Add at least one line with an amount before sending');
  await supabase.from('invoices').update({ status: 'sent', issued_on: inv!.issued_on || today(), sent_to: c.email }).eq('id', id);
  const { link } = await notifyClient(ws, c, `${inv!.number} from ${ws.name}: ${money(tot.total, ws.currency)}`, `New invoice from ${ws.name}`, [`Hi ${first(c.name)},`, `${inv!.title} for ${money(tot.total, ws.currency, true)} is due on ${inv!.due_on}.`, 'You can pay by card or bank transfer from your portal.'], `/invoices/${id}`);
  await logActivity(supabase, ws.id, user.id, name, 'invoice.sent', `sent ${inv!.number} to ${c.name}`, { type: 'invoice', id });
  back(`/s/${slug}/invoices/${id}${link ? '?invite=' + encodeURIComponent(link) : ''}`, `Sent to ${c.email}`);
}
export async function sendInvoice(fd: FormData) { await ctx(fd); return sendInvoiceInner(s(fd, 'id'), s(fd, 'ws')); }

export async function invoiceAction(fd: FormData) {
  const { supabase, ws, user, name } = await ctx(fd); const id = s(fd, 'id'); const op = s(fd, 'op'); const path = `/s/${ws.slug}/invoices/${id}`;
  const { data: inv } = await supabase.from('invoices').select('*, contacts(*), invoice_items(*)').eq('id', id).eq('workspace_id', ws.id).single();
  if (!inv) err(`/s/${ws.slug}/invoices`, 'Invoice not found');
  const tot = await totalOf(supabase, id); const c = inv!.contacts as Contact;
  if (op === 'record') {
    const amount = n(fd, 'amount') || Number(tot.total) - Number(tot.paid);
    if (amount <= 0) err(path, 'Enter the amount received');
    const { error } = await supabase.from('payments').insert({ workspace_id: ws.id, invoice_id: id, amount, method: s(fd, 'method') || 'Bank transfer', provider: 'manual', reference: s(fd, 'reference') || null, paid_at: (s(fd, 'paid_on') || today()) + 'T12:00:00Z' });
    if (error) err(path, error.code === '23505' ? 'That reference is already recorded' : error.message);
    const fully = Number(tot.paid) + amount >= Number(tot.total) - 0.01;
    await supabase.from('invoices').update(fully ? { status: 'paid', paid_on: s(fd, 'paid_on') || today(), paid_method: s(fd, 'method') || 'Bank transfer' } : { status: 'sent' }).eq('id', id);
    await logActivity(supabase, ws.id, user.id, name, 'invoice.payment', `recorded ${money(amount, ws.currency)} for ${inv!.number}`, { type: 'invoice', id });
    back(path, fully ? 'Marked as paid' : 'Part payment recorded');
  }
  if (op === 'remind') {
    await notifyClient(ws, c, `Reminder: ${inv!.number} is due ${inv!.due_on}`, `A reminder about ${inv!.number}`, [`Hi ${first(c.name)},`, `A friendly reminder that ${inv!.title} for ${money(Number(tot.total) - Number(tot.paid), ws.currency, true)} is due on ${inv!.due_on}.`], `/invoices/${id}`);
    await logActivity(supabase, ws.id, user.id, name, 'invoice.reminder', `sent a reminder for ${inv!.number}`, { type: 'invoice', id });
    back(path, `Reminder sent to ${c.email}`);
  }
  if (op === 'void') { await supabase.from('invoices').update({ status: 'void' }).eq('id', id); await logActivity(supabase, ws.id, user.id, name, 'invoice.void', `voided ${inv!.number}`, { type: 'invoice', id }); back(path, 'Invoice voided'); }
  if (op === 'delete') { if (inv!.status !== 'draft') err(path, 'Only drafts can be deleted'); await supabase.from('invoices').delete().eq('id', id); back(`/s/${ws.slug}/invoices`, 'Draft deleted'); }
  if (op === 'duplicate') {
    const number = (await supabase.rpc('next_number', { p_ws: ws.id, p_kind: 'invoice' })).data as string;
    const { data: d } = await supabase.from('invoices').insert({ workspace_id: ws.id, contact_id: inv!.contact_id, project_id: inv!.project_id, number, title: inv!.title, vat: inv!.vat, pass_fees: inv!.pass_fees, due_on: addDays(today(), ws.payment_terms_days) }).select('id').single();
    const items = (inv!.invoice_items as InvoiceItem[]).map((i, k) => ({ invoice_id: d!.id, workspace_id: ws.id, description: i.description, qty: i.qty, rate: i.rate, position: k }));
    if (items.length) await supabase.from('invoice_items').insert(items);
    back(`/s/${ws.slug}/invoices/${d!.id}`, `Copied to ${number}`);
  }
  back(path);
}

/* ================= contracts ================= */
async function insertContract(supabase: Awaited<ReturnType<typeof requireMember>>['supabase'], ws: Workspace, project: Project, contact: Contact, templateId: string | null) {
  let tq = supabase.from('contract_templates').select('*').eq('workspace_id', ws.id);
  tq = templateId ? tq.eq('id', templateId) : tq.order('created_at').limit(1);
  const { data: t } = await tq.maybeSingle();
  const number = (await supabase.rpc('next_number', { p_ws: ws.id, p_kind: 'contract' })).data as string;
  const body = fillSections((t?.sections as Section[]) || [], { w: ws, c: contact, p: project });
  const { data } = await supabase.from('contracts').insert({ workspace_id: ws.id, project_id: project.id, contact_id: contact.id, template_id: t?.id ?? null, number, title: t?.name || 'Project agreement', body }).select('id').single();
  return data!.id as string;
}

export async function createContract(fd: FormData) {
  const { supabase, ws, user, name } = await ctx(fd); const pid = s(fd, 'project_id');
  if (!pid) err(`/s/${ws.slug}/contracts?new=1`, 'Choose a project');
  const { data: p } = await supabase.from('projects').select('*, contacts(*)').eq('id', pid).eq('workspace_id', ws.id).single();
  if (!p) err(`/s/${ws.slug}/contracts`, 'Project not found');
  const id = await insertContract(supabase, ws, p as Project, p!.contacts as Contact, s(fd, 'template_id') || null);
  await logActivity(supabase, ws.id, user.id, name, 'contract.created', `drafted a contract for ${p!.name}`, { type: 'contract', id });
  redirect(`/s/${ws.slug}/contracts/${id}`);
}

export async function saveContract(fd: FormData) {
  const { supabase, ws } = await ctx(fd); const id = s(fd, 'id');
  const { data: c } = await supabase.from('contracts').select('status').eq('id', id).eq('workspace_id', ws.id).single();
  if (c?.status !== 'draft') err(`/s/${ws.slug}/contracts/${id}`, 'Only drafts can be edited');
  let body: Section[] = [];
  try { body = (JSON.parse(s(fd, 'body') || '[]') as Section[]).filter((x) => x.heading?.trim() || x.body?.trim()).map((x) => ({ heading: x.heading.slice(0, 120), body: x.body.slice(0, 6000) })); } catch { err(`/s/${ws.slug}/contracts/${id}`, 'Sections could not be read'); }
  // Editing the text after signing for the studio would invalidate that signature
  await supabase.from('contracts').update({ title: s(fd, 'title') || 'Project agreement', body, studio_signed_at: null, studio_signer_name: null, studio_signer_id: null }).eq('id', id);
  back(`/s/${ws.slug}/contracts/${id}`, 'Draft saved. Sign it again before sending.');
}

export async function contractAction(fd: FormData) {
  const { supabase, ws, user, name } = await ctx(fd); const id = s(fd, 'id'); const op = s(fd, 'op'); const path = `/s/${ws.slug}/contracts/${id}`;
  const { data: k } = await supabase.from('contracts').select('*, contacts(*)').eq('id', id).eq('workspace_id', ws.id).single();
  if (!k) err(`/s/${ws.slug}/contracts`, 'Contract not found');
  const c = k!.contacts as Contact;
  if (op === 'studio-sign') {
    if (k!.status !== 'draft') err(path, 'Already sent');
    await supabase.from('contracts').update({ studio_signer_id: user.id, studio_signer_name: s(fd, 'signer') || name, studio_signed_at: new Date().toISOString() }).eq('id', id);
    await logActivity(supabase, ws.id, user.id, name, 'contract.studio_signed', `signed ${k!.number} for ${ws.name}`, { type: 'contract', id });
    back(path, 'Signed for the studio');
  }
  if (op === 'send') {
    if (k!.status !== 'draft') err(path, 'Already sent');
    if (!k!.studio_signed_at) err(path, 'Sign for the studio first, so the client only adds their signature');
    if (!c.email) err(path, `Add an email for ${c.name} first`);
    await supabase.from('contracts').update({ status: 'sent', sent_at: new Date().toISOString(), change_request: null }).eq('id', id);
    const { link } = await notifyClient(ws, c, `Please sign: ${k!.title}`, `${ws.name} sent you an agreement`, [`Hi ${first(c.name)},`, `${k!.title} is ready for your signature. ${ws.name} has already signed.`, 'It takes about two minutes. You can also ask for changes instead.'], `/contracts/${id}`);
    await logActivity(supabase, ws.id, user.id, name, 'contract.sent', `sent ${k!.number} to ${c.name}`, { type: 'contract', id });
    back(path + (link ? '?invite=' + encodeURIComponent(link) : ''), `Sent to ${c.email}`);
  }
  if (op === 'revise') { await supabase.from('contracts').update({ status: 'draft', studio_signed_at: null, studio_signer_name: null }).eq('id', id); back(path, 'Back to draft. Edit, sign and send again.'); }
  if (op === 'remind') { await notifyClient(ws, c, `Reminder: ${k!.title} is waiting for you`, 'Your agreement is waiting', [`Hi ${first(c.name)},`, `${k!.title} still needs your signature.`], `/contracts/${id}`); back(path, 'Reminder sent'); }
  if (op === 'void') { await supabase.from('contracts').update({ status: 'void' }).eq('id', id); await logActivity(supabase, ws.id, user.id, name, 'contract.void', `voided ${k!.number}`, { type: 'contract', id }); back(path, 'Contract voided'); }
  if (op === 'delete') { if (k!.status !== 'draft') err(path, 'Only drafts can be deleted'); await supabase.from('contracts').delete().eq('id', id); back(`/s/${ws.slug}/contracts`, 'Draft deleted'); }
  back(path);
}

export async function saveTemplate(fd: FormData) {
  const { supabase, ws } = await ctx(fd); const id = s(fd, 'id');
  let sections: Section[] = [];
  try { sections = JSON.parse(s(fd, 'sections') || '[]'); } catch { err(`/s/${ws.slug}/contracts/templates/${id}`, 'Sections could not be read'); }
  const row = { workspace_id: ws.id, name: s(fd, 'name') || 'Untitled template', sections: sections.filter((x) => x.heading || x.body) };
  if (id === 'new') { const { data } = await supabase.from('contract_templates').insert(row).select('id').single(); back(`/s/${ws.slug}/contracts/templates/${data!.id}`, 'Template created'); }
  if (s(fd, 'op') === 'delete') { await supabase.from('contract_templates').delete().eq('id', id).eq('workspace_id', ws.id); back(`/s/${ws.slug}/contracts?tab=templates`, 'Template deleted'); }
  await supabase.from('contract_templates').update(row).eq('id', id).eq('workspace_id', ws.id);
  back(`/s/${ws.slug}/contracts/templates/${id}`, 'Template saved');
}

/* ================= messages ================= */
export async function sendMessage(fd: FormData) {
  const { supabase, ws, user } = await ctx(fd); const cid = s(fd, 'contact_id'); const body = s(fd, 'body');
  if (!body) back(`/s/${ws.slug}/inbox/${cid}`);
  const { data: c } = await supabase.from('contacts').select('*').eq('id', cid).eq('workspace_id', ws.id).single();
  if (!c) err(`/s/${ws.slug}/inbox`, 'Contact not found');
  await supabase.from('messages').insert({ workspace_id: ws.id, contact_id: cid, sender_id: user.id, from_client: false, body, read_by_studio_at: new Date().toISOString() });
  if (c!.email) await notifyClient(ws, c as Contact, `New message from ${ws.name}`, `${ws.name} sent you a message`, [body.slice(0, 600)], '/messages');
  back(`/s/${ws.slug}/inbox/${cid}`);
}

/* ================= settings ================= */
export async function saveSettings(fd: FormData) {
  const { supabase, ws, role } = await ctx(fd); const tab = s(fd, 'tab');
  if (role === 'member') err(`/s/${ws.slug}/settings?tab=${tab}`, 'Only owners and admins can change settings');
  let patch: Record<string, unknown> = {};
  if (tab === 'studio') patch = { name: s(fd, 'name'), legal_name: s(fd, 'legal_name') || null, email: s(fd, 'email') || null, phone: s(fd, 'phone') || null, address: s(fd, 'address') || null, company_number: s(fd, 'company_number') || null, tax_id: s(fd, 'tax_id') || null, brand_color: /^#[0-9a-f]{6}$/i.test(s(fd, 'brand_color')) ? s(fd, 'brand_color') : ws.brand_color };
  if (tab === 'portal') patch = { portal_welcome: s(fd, 'portal_welcome') || ws.portal_welcome, portal_show_plan: on(fd, 'portal_show_plan') };
  if (tab === 'payments') patch = { currency: s(fd, 'currency') || 'NGN', vat_rate: n(fd, 'vat_rate'), pass_card_fees: on(fd, 'pass_card_fees'), card_fee_pct: n(fd, 'card_fee_pct'), payment_terms_days: n(fd, 'payment_terms_days'), bank_name: s(fd, 'bank_name') || null, bank_account_name: s(fd, 'bank_account_name') || null, bank_account_number: s(fd, 'bank_account_number') || null };
  const { error } = await supabase.from('workspaces').update(patch).eq('id', ws.id);
  if (error) err(`/s/${ws.slug}/settings?tab=${tab}`, error.message);
  back(`/s/${ws.slug}/settings?tab=${tab}`, 'Settings saved');
}

/** Connects the studio's bank account as a Paystack subaccount so client payments settle to the studio. */
export async function connectPaystack(fd: FormData) {
  const { ws, role, user } = await ctx(fd); const path = `/s/${ws.slug}/settings?tab=payments`;
  if (role !== 'owner') err(path, 'Only the owner can connect payouts');
  const bank = s(fd, 'bank_code'), acct = s(fd, 'account_number');
  if (!/^\d{10}$/.test(acct)) err(path, 'Enter the 10-digit account number');
  let accountName = '';
  try { accountName = (await resolveAccount(acct, bank)).account_name; } catch (e) { err(path, 'Paystack could not find that account: ' + (e as Error).message); }
  try {
    const sub = await createSubaccount({ business_name: ws.legal_name || ws.name, settlement_bank: bank, account_number: acct, percentage_charge: platformFeePct(ws.plan as PlanKey), primary_contact_email: ws.email || user.email || undefined });
    await createAdminClient().from('workspaces').update({ paystack_subaccount_code: sub.subaccount_code, bank_account_name: accountName, bank_account_number: acct, bank_name: s(fd, 'bank_name') || ws.bank_name }).eq('id', ws.id);
  } catch (e) { err(path, 'Paystack: ' + (e as Error).message); }
  back(path, `Payouts connected to ${accountName}`);
}

export async function inviteMember(fd: FormData) {
  const { supabase, ws, user, role } = await ctx(fd); const path = `/s/${ws.slug}/settings?tab=team`;
  if (role === 'member') err(path, 'Only owners and admins can invite');
  const email = s(fd, 'email').toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(email)) err(path, 'Enter an email like name@studio.com');
  const limit = PLANS[ws.plan as PlanKey]?.members ?? 1;
  const [{ count: members }, { count: pending }] = await Promise.all([
    supabase.from('workspace_members').select('user_id', { count: 'exact', head: true }).eq('workspace_id', ws.id),
    supabase.from('workspace_invites').select('id', { count: 'exact', head: true }).eq('workspace_id', ws.id).is('accepted_at', null),
  ]);
  const trialing = ws.plan_status === 'trialing' && new Date(ws.trial_ends_at) > new Date();
  if (!trialing && (members || 0) + (pending || 0) >= limit) err(`/s/${ws.slug}/settings?tab=billing`, `The ${PLANS[ws.plan as PlanKey].name} plan includes ${limit} team member${limit > 1 ? 's' : ''}. Upgrade to invite more.`);
  const { data: inv, error } = await supabase.from('workspace_invites').insert({ workspace_id: ws.id, email, role: s(fd, 'role') === 'admin' ? 'admin' : 'member', invited_by: user.id }).select('token').single();
  if (error) err(path, error.message);
  const link = `${env.appUrl}/invite/${inv!.token}`;
  const { sent } = await sendEmail({ to: email, subject: `Join ${ws.name} on Onera`, heading: `You're invited to ${ws.name}`, lines: ['Create an account or sign in with this email, then accept the invite.'], button: { label: 'Accept invite', url: link }, studio: { name: ws.name, color: ws.brand_color } });
  back(sent ? path : `${path}&invite=${encodeURIComponent(link)}`, sent ? `Invite sent to ${email}` : 'Invite created. Copy the link below to share it.');
}

export async function teamAction(fd: FormData) {
  const { supabase, ws, role } = await ctx(fd); const path = `/s/${ws.slug}/settings?tab=team`;
  if (role === 'member') err(path, 'Only owners and admins can manage the team');
  const op = s(fd, 'op');
  if (op === 'revoke') await supabase.from('workspace_invites').delete().eq('id', s(fd, 'id')).eq('workspace_id', ws.id);
  if (op === 'remove') await supabase.from('workspace_members').delete().eq('workspace_id', ws.id).eq('user_id', s(fd, 'user_id'));
  if (op === 'role') await supabase.from('workspace_members').update({ role: s(fd, 'role') === 'admin' ? 'admin' : 'member' }).eq('workspace_id', ws.id).eq('user_id', s(fd, 'user_id'));
  back(path, 'Team updated');
}

/** Starts a Paystack subscription checkout for the studio's plan. The webhook activates it. */
export async function startSubscription(fd: FormData) {
  const { ws, user, role } = await ctx(fd); const path = `/s/${ws.slug}/settings?tab=billing`;
  if (role !== 'owner') err(path, 'Only the owner can change the plan');
  const plan = s(fd, 'plan') as PlanKey;
  const code = plan === 'studio' ? process.env.PAYSTACK_PLAN_STUDIO : plan === 'agency' ? process.env.PAYSTACK_PLAN_AGENCY : undefined;
  if (!code) err(path, 'Plan codes are not configured. Set PAYSTACK_PLAN_STUDIO and PAYSTACK_PLAN_AGENCY.');
  const h = await headers();
  let url = '';
  try {
    const tx = await initializeTransaction({ email: user.email!, amount: PLANS[plan].price, reference: `sub_${ws.id.slice(0, 8)}_${Date.now()}`, currency: 'NGN', plan: code, callbackUrl: `${env.appUrl}/api/paystack/callback?kind=subscription&ws=${ws.slug}`, metadata: { kind: 'subscription', workspace_id: ws.id, plan, ip: h.get('x-forwarded-for') } });
    url = tx.authorization_url;
  } catch (e) { err(path, 'Paystack: ' + (e as Error).message); }
  redirect(url);
}

export async function previewPortalLink(fd: FormData) {
  const { ws } = await ctx(fd);
  redirect(portalUrl(ws.slug));
}
