import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { notifyClient } from '@/lib/server-helpers';
import { sendEmail } from '@/lib/email';
import { env } from '@/lib/env';
import { addDays, dateY, first, money, today } from '@/lib/format';
import { fillSections } from '@/lib/vars';
import { fmtDay, fmtTime, tzLabel } from '@/lib/slots';
import type { Booking, Contact, Contract, Invoice, Project, ProposalItem, Section, Workspace } from '@/lib/types';

const admin = () => createAdminClient();
const sum = (items: ProposalItem[]) => items.reduce((s, it) => s + Number(it.qty) * Number(it.rate), 0);
const round2 = (n: number) => Math.round(n * 100) / 100;

async function nextNumber(wsId: string, kind: 'invoice' | 'contract' | 'quote') {
  const { data, error } = await admin().rpc('next_number_system', { p_ws: wsId, p_kind: kind });
  if (error) throw new Error(error.message);
  return data as string;
}

/** Email the studio (its reply address) about something a client did. */
export async function notifyStudio(ws: Workspace, subject: string, heading: string, lines: string[], path: string) {
  if (!ws.email) return;
  await sendEmail({ to: ws.email, subject, heading, lines, button: { label: 'Open in Onera', url: `${env.appUrl}/s/${ws.slug}${path}` }, studio: { name: 'Onera' } });
}

/**
 * A client accepted a proposal: create (or reuse) the project, a contract the studio has already signed,
 * and the deposit invoice. Returns where to send the client next.
 */
export async function convertAcceptedProposal(proposalId: string) {
  const db = admin();
  const { data: q } = await db.from('proposals').select('*, proposal_items(*), contacts(*), workspaces(*)').eq('id', proposalId).single();
  if (!q || q.status !== 'accepted') throw new Error('Proposal is not accepted');
  if (q.contract_id || q.invoice_id) return { contractId: q.contract_id as string | null, invoiceId: q.invoice_id as string | null };
  const ws = q.workspaces as Workspace, c = q.contacts as Contact, items = (q.proposal_items || []) as ProposalItem[];
  const subtotal = sum(items);

  let projectId: string | null = q.project_id;
  let project: Project | null = null;
  if (projectId) {
    const { data } = await db.from('projects').select('*').eq('id', projectId).single(); project = data as Project;
  } else {
    const code = `${(c.company || c.name).replace(/[^A-Za-z]/g, '').slice(0, 3).toUpperCase() || 'PRJ'}-${Date.now().toString().slice(-4)}`;
    const { data, error } = await db.from('projects').insert({ workspace_id: ws.id, contact_id: c.id, code, name: q.title.replace(/\s*proposal\s*$/i, '') || q.title, service: q.service || '', value: subtotal, summary: (q.intro || '').slice(0, 1000) }).select().single();
    if (error) throw new Error(error.message);
    project = data as Project; projectId = project.id;
    const standard = ['Kick-off call', 'Discovery and research', 'First concepts', 'Revisions', 'Final delivery'];
    await db.from('tasks').insert(standard.map((title, i) => ({ workspace_id: ws.id, project_id: projectId, title, position: i })));
  }
  if (q.lead_id) await db.from('leads').update({ stage: 'won', project_id: projectId }).eq('id', q.lead_id);
  await db.from('contacts').update({ type: 'client' }).eq('id', c.id);

  // Contract: from the chosen template (or the studio's first one), signed by whoever sent the proposal
  let contractId: string | null = null;
  let tplId = q.template_id as string | null;
  if (!tplId) { const { data: t } = await db.from('contract_templates').select('id').eq('workspace_id', ws.id).order('created_at').limit(1).maybeSingle(); tplId = t?.id || null; }
  if (tplId) {
    const { data: tpl } = await db.from('contract_templates').select('*').eq('id', tplId).single();
    const body = fillSections((tpl?.sections || []) as Section[], { w: ws, c, p: project });
    const { data: k, error } = await db.from('contracts').insert({
      workspace_id: ws.id, project_id: projectId, contact_id: c.id, template_id: tplId, number: await nextNumber(ws.id, 'contract'),
      title: `${project?.name || q.title} agreement`, body, status: 'sent', sent_at: new Date().toISOString(),
      studio_signer_name: q.sent_by_name || ws.name, studio_signed_at: q.sent_at || new Date().toISOString(),
    }).select('id').single();
    if (error) throw new Error(error.message);
    contractId = k.id;
  }

  // Deposit invoice, sent straight away
  let invoiceId: string | null = null;
  const deposit = round2((subtotal * Number(q.deposit_pct)) / 100);
  if (deposit > 0) {
    const { data: inv, error } = await db.from('invoices').insert({
      workspace_id: ws.id, project_id: projectId, contact_id: c.id, number: await nextNumber(ws.id, 'invoice'),
      title: `Deposit (${q.deposit_pct}%)`, status: 'sent', vat: q.vat, issued_on: today(), due_on: addDays(today(), ws.payment_terms_days), sent_to: c.email,
    }).select('id').single();
    if (error) throw new Error(error.message);
    invoiceId = inv.id;
    await db.from('invoice_items').insert({ workspace_id: ws.id, invoice_id: invoiceId, description: `${q.title}: ${q.deposit_pct}% deposit`, qty: 1, rate: deposit, position: 0 });
    if (Number(q.deposit_pct) < 100) {
      const rest = round2(subtotal - deposit);
      const { data: bal } = await db.from('invoices').insert({ workspace_id: ws.id, project_id: projectId, contact_id: c.id, number: await nextNumber(ws.id, 'invoice'), title: `Balance (${100 - Number(q.deposit_pct)}%)`, status: 'draft', vat: q.vat, due_on: addDays(today(), 30) }).select('id').single();
      if (bal) await db.from('invoice_items').insert({ workspace_id: ws.id, invoice_id: bal.id, description: `${q.title}: balance`, qty: 1, rate: rest, position: 0 });
    }
  }
  await db.from('proposals').update({ project_id: projectId, contract_id: contractId, invoice_id: invoiceId }).eq('id', q.id);
  await db.from('activity').insert({ workspace_id: ws.id, actor_name: c.name, from_client: true, kind: 'proposal.converted', entity_type: 'project', entity_id: projectId, message: `accepted ${q.number}. Project, contract${invoiceId ? ' and deposit invoice' : ''} created` });
  await notifyStudio(ws, `${c.name} accepted ${q.number}`, 'Proposal accepted', [`${c.name} accepted "${q.title}" (${money(subtotal, ws.currency)}).`, `Onera created the project${contractId ? ', sent the agreement to sign' : ''}${invoiceId ? ` and sent the ${q.deposit_pct}% deposit invoice` : ''}.`], `/projects/${projectId}`);
  return { contractId, invoiceId, projectId };
}

/** After a contract is signed: send the project's earliest draft invoice, if the studio turned that on. */
export async function sendFirstDraftOnSign(contractId: string) {
  const db = admin();
  const { data: k } = await db.from('contracts').select('*, workspaces(*), contacts(*)').eq('id', contractId).single();
  if (!k?.project_id) return null;
  const ws = k.workspaces as Workspace, c = k.contacts as Contact;
  if (!ws.auto_send_on_sign) return null;
  const { data: draft } = await db.from('invoices').select('*').eq('project_id', k.project_id).eq('status', 'draft').order('created_at').limit(1).maybeSingle();
  if (!draft) return null;
  const { data: t } = await db.from('invoice_totals').select('*').eq('invoice_id', draft.id).single();
  if (!t || Number(t.total) <= 0) return null;
  await db.from('invoices').update({ status: 'sent', issued_on: today(), due_on: addDays(today(), ws.payment_terms_days), sent_to: c.email }).eq('id', draft.id);
  await notifyClient(ws, c, `${draft.number} from ${ws.name}: ${money(t.total, ws.currency)}`, `New invoice from ${ws.name}`, [`Hi ${first(c.name)},`, `Thanks for signing. ${draft.title} for ${money(t.total, ws.currency, true)} is ready in your portal.`], `/invoices/${draft.id}`);
  await db.from('activity').insert({ workspace_id: ws.id, actor_name: 'Automation', kind: 'invoice.sent', entity_type: 'invoice', entity_id: draft.id, message: `sent ${draft.number} after ${k.number} was signed` });
  return draft.id as string;
}

/** Each reminder goes out once per invoice/contract/booking. Returns false if it was already sent. */
async function once(wsId: string, entityId: string, kind: string) {
  const { error } = await admin().from('reminder_log').insert({ workspace_id: wsId, entity_id: entityId, kind });
  return !error;
}

/** Daily job: invoice reminders (3 days before, on the day, 3 and 7 days late), contract nudges, booking reminders. */
export async function runDailyAutomations() {
  const db = admin(); const t = today();
  const report = { invoices: 0, contracts: 0, bookings: 0 };

  const { data: invs } = await db.from('invoices').select('*, contacts(*), workspaces(*)').eq('status', 'sent').gte('due_on', addDays(t, -8)).lte('due_on', addDays(t, 3));
  for (const inv of (invs || []) as (Invoice & { contacts: Contact; workspaces: Workspace })[]) {
    const ws = inv.workspaces, c = inv.contacts;
    if (!ws.auto_invoice_reminders || !c.email) continue;
    const days = Math.round((Date.parse(inv.due_on) - Date.parse(t)) / 864e5);
    const kind = days === 3 ? 'inv.before3' : days === 0 ? 'inv.due' : days === -3 ? 'inv.late3' : days === -7 ? 'inv.late7' : null;
    if (!kind || !(await once(ws.id, inv.id, kind))) continue;
    const { data: tot } = await db.from('invoice_totals').select('*').eq('invoice_id', inv.id).single();
    const bal = Number(tot?.total || 0) - Number(tot?.paid || 0);
    if (bal <= 0) continue;
    const when = days > 0 ? `is due on ${dateY(inv.due_on)}` : days === 0 ? 'is due today' : `was due on ${dateY(inv.due_on)}`;
    await notifyClient(ws, c, days < 0 ? `Overdue: ${inv.number} from ${ws.name}` : `Reminder: ${inv.number} ${when}`, days < 0 ? `${inv.number} is overdue` : `A reminder about ${inv.number}`,
      [`Hi ${first(c.name)},`, `${inv.title} for ${money(bal, ws.currency, true)} ${when}.`, 'You can pay by card or bank transfer from your portal. If you have already paid, thank you, and please ignore this email.'], `/invoices/${inv.id}`);
    await db.from('activity').insert({ workspace_id: ws.id, actor_name: 'Automation', kind: 'invoice.reminder', entity_type: 'invoice', entity_id: inv.id, message: `sent an automatic reminder for ${inv.number}` });
    report.invoices++;
  }

  const { data: ks } = await db.from('contracts').select('*, contacts(*), workspaces(*)').eq('status', 'sent').lte('sent_at', new Date(Date.now() - 3 * 864e5).toISOString());
  for (const k of (ks || []) as (Contract & { contacts: Contact; workspaces: Workspace })[]) {
    const ws = k.workspaces, c = k.contacts;
    if (!ws.auto_contract_reminders || !c.email) continue;
    const age = Math.floor((Date.now() - Date.parse(k.sent_at!)) / 864e5);
    const kind = age >= 7 ? 'con.day7' : 'con.day3';
    if (!(await once(ws.id, k.id, kind))) continue;
    await notifyClient(ws, c, `Reminder: ${k.title} is waiting for your signature`, 'Your agreement is waiting', [`Hi ${first(c.name)},`, `${ws.name} sent "${k.title}" ${age} days ago. It takes a minute to review and sign in your portal.`], `/contracts/${k.id}`);
    report.contracts++;
  }

  const tomorrow = new Date(Date.now() + 864e5);
  const { data: bs } = await db.from('bookings').select('*, workspaces(*)').eq('status', 'confirmed').is('reminded_at', null).gte('starts_at', new Date().toISOString()).lte('starts_at', tomorrow.toISOString());
  for (const bk of (bs || []) as (Booking & { workspaces: Workspace })[]) {
    const ws = bk.workspaces;
    if (!ws.auto_booking_reminders) continue;
    await db.from('bookings').update({ reminded_at: new Date().toISOString() }).eq('id', bk.id);
    await sendEmail({ to: bk.email, subject: `Reminder: ${bk.title} with ${ws.name}`, heading: 'See you soon', lines: [`Hi ${first(bk.name)},`, `This is a reminder of your ${bk.title} with ${ws.name} on ${fmtDay(bk.starts_at, ws.booking_timezone)} at ${fmtTime(bk.starts_at, ws.booking_timezone)} (${tzLabel(ws.booking_timezone)}).`], button: { label: 'Change or cancel', url: `${env.appUrl}/b/manage/${bk.manage_token}` }, studio: { name: ws.name, color: ws.brand_color }, replyTo: ws.email || undefined });
    report.bookings++;
  }
  return report;
}

