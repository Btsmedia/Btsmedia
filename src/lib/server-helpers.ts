import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createAdminClient } from './supabase/admin';
import { env, portalUrl } from './env';
import { sendEmail } from './email';
import { money, first } from './format';
import type { Contact, Workspace } from './types';

/** Studio-side activity log entry, written as the signed-in member. */
export async function logActivity(sb: SupabaseClient, ws: string, userId: string, name: string, kind: string, message: string, entity?: { type: string; id: string }) {
  await sb.from('activity').insert({ workspace_id: ws, actor_id: userId, actor_name: name, kind, message, entity_type: entity?.type, entity_id: entity?.id });
}

/**
 * Creates a one-time sign-in link for a client and marks them invited.
 * New emails get an account created; existing accounts (a client of another studio) get a magic link.
 */
export async function portalInviteLink(ws: Workspace, contact: Contact): Promise<string> {
  if (!contact.email) throw new Error('Add an email address to this contact first');
  const admin = createAdminClient();
  const redirectTo = `${env.appUrl}/auth/confirm?next=${encodeURIComponent(`/p/${ws.slug}`)}`;
  let type: 'invite' | 'magiclink' = 'invite';
  let res = await admin.auth.admin.generateLink({ type: 'invite', email: contact.email, options: { redirectTo, data: { full_name: contact.name } } });
  if (res.error) { type = 'magiclink'; res = await admin.auth.admin.generateLink({ type: 'magiclink', email: contact.email, options: { redirectTo } }); }
  if (res.error || !res.data.properties) throw new Error(res.error?.message || 'Could not create a sign-in link');
  await admin.from('contacts').update({ portal_status: contact.portal_status === 'active' ? 'active' : 'invited', portal_invited_at: new Date().toISOString() }).eq('id', contact.id);
  return `${env.appUrl}/auth/confirm?token_hash=${res.data.properties.hashed_token}&type=${type}&next=${encodeURIComponent(`/p/${ws.slug}`)}`;
}

/** Email a client about something new in their portal, with a sign-in link if they haven't joined yet. */
export async function notifyClient(ws: Workspace, contact: Contact, subject: string, heading: string, lines: string[], path: string) {
  if (!contact.email) return { link: null as string | null };
  let url = portalUrl(ws.slug, path);
  if (contact.portal_status !== 'active') url = await portalInviteLink(ws, contact);
  await sendEmail({ to: contact.email, subject, heading, lines, button: { label: 'Open your portal', url }, studio: { name: ws.name, color: ws.brand_color }, replyTo: ws.email || undefined });
  return { link: contact.portal_status !== 'active' ? url : null };
}

/**
 * Records a successful Paystack payment. Safe to call twice (callback and webhook both do):
 * the payment row is keyed by reference and only flips from pending to success once.
 */
export async function settlePayment(reference: string, tx: { amount: number; fees: number; channel: string; paid_at: string; authorization?: { last4?: string; card_type?: string } }) {
  const admin = createAdminClient();
  const { data: pay } = await admin.from('payments').select('*').eq('reference', reference).maybeSingle();
  if (!pay) return { ok: false, reason: 'unknown reference' };
  if (pay.status === 'success') return { ok: true, already: true, invoiceId: pay.invoice_id };
  const method = tx.channel === 'card' ? `Card${tx.authorization?.last4 ? ' ending ' + tx.authorization.last4 : ''}` : tx.channel === 'bank_transfer' ? 'Bank transfer' : tx.channel;
  // Paystack amounts include any card fee passed on to the client; credit the invoice with the invoice amount only.
  await admin.from('payments').update({ status: 'success', fee: tx.fees / 100, method, paid_at: tx.paid_at || new Date().toISOString() }).eq('id', pay.id);
  const { data: inv } = await admin.from('invoices').select('*, contacts(*), workspaces(*)').eq('id', pay.invoice_id).single();
  const { data: tot } = await admin.from('invoice_totals').select('*').eq('invoice_id', pay.invoice_id).single();
  if (inv && tot && Number(tot.paid) >= Number(tot.total) - 0.01) {
    await admin.from('invoices').update({ status: 'paid', paid_on: new Date().toISOString().slice(0, 10), paid_method: method }).eq('id', inv.id);
  }
  if (inv) {
    const c = inv.contacts as Contact, w = inv.workspaces as Workspace;
    await admin.from('activity').insert({ workspace_id: inv.workspace_id, actor_name: c.name, from_client: true, kind: 'invoice.paid', entity_type: 'invoice', entity_id: inv.id, message: `paid ${inv.number} (${money(pay.amount, w.currency)})` });
    if (c.email) await sendEmail({ to: c.email, subject: `Receipt for ${inv.number}`, heading: 'Payment received', lines: [`Thank you, ${first(c.name)}. ${w.name} received ${money(pay.amount, w.currency, true)} for ${inv.title}.`, `Reference: ${reference}`], button: { label: 'View invoice', url: portalUrl(w.slug, `/invoices/${inv.id}`) }, studio: { name: w.name, color: w.brand_color } });
  }
  return { ok: true, invoiceId: pay.invoice_id };
}
