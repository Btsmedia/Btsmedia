'use server';
import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { requirePortal, back } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { initializeTransaction } from '@/lib/paystack';
import { totalOf } from '@/lib/data';
import { env } from '@/lib/env';
import { sendEmail } from '@/lib/email';
import { platformFeePct, type PlanKey } from '@/lib/plans';
import { convertAcceptedProposal, notifyStudio, sendFirstDraftOnSign } from '@/lib/automations';

const s = (fd: FormData, k: string) => String(fd.get(k) ?? '').trim();
const base = (fd: FormData) => `/p/${s(fd, 'slug')}`;

export async function portalSignIn(fd: FormData) {
  const sb = await createClient(); const slug = s(fd, 'slug'); const email = s(fd, 'email').toLowerCase(); const password = String(fd.get('password') || '');
  const path = `/p/${slug}/login`;
  if (!/^\S+@\S+\.\S+$/.test(email)) back(path, undefined, 'Enter the email address the studio has for you');
  if (password) {
    const { error } = await sb.auth.signInWithPassword({ email, password });
    if (error) back(`${path}?email=${encodeURIComponent(email)}`, undefined, 'That password doesn\'t match. Try again or email yourself a sign-in link.');
    redirect(`/p/${slug}`);
  }
  const { error } = await sb.auth.signInWithOtp({ email, options: { shouldCreateUser: false, emailRedirectTo: `${env.appUrl}/auth/callback?next=${encodeURIComponent(`/p/${slug}`)}` } });
  // Same message either way, so the form doesn't reveal which emails have access
  if (error && !/signups not allowed|not found/i.test(error.message)) back(path, undefined, error.message);
  back(`${path}?sent=1&email=${encodeURIComponent(email)}`);
}

export async function portalSignOut(fd: FormData) {
  const sb = await createClient(); await sb.auth.signOut(); redirect(`${base(fd)}/login`);
}

export async function clientMessage(fd: FormData) {
  const { supabase, ws, contact, user } = await requirePortal(s(fd, 'slug'));
  const body = s(fd, 'body'); const to = s(fd, 'return') || `/p/${ws.slug}/messages`;
  if (!body) back(to);
  const { error } = await supabase.from('messages').insert({ workspace_id: ws.id, contact_id: contact.id, sender_id: user.id, from_client: true, body, read_by_client_at: new Date().toISOString() });
  if (error) back(to, undefined, 'Your message could not be sent. Try again.');
  if (ws.email) await sendEmail({ to: ws.email, subject: `New message from ${contact.name}`, heading: `${contact.name} sent a message`, lines: [body.slice(0, 800)], button: { label: 'Reply in your inbox', url: `${env.appUrl}/s/${ws.slug}/inbox/${contact.id}` }, studio: { name: 'Onera' } });
  back(to, to.endsWith('/messages') ? undefined : 'Sent. You\'ll find the reply in Messages.');
}

export async function clientToggleTask(fd: FormData) {
  const { supabase } = await requirePortal(s(fd, 'slug'));
  const { error } = await supabase.rpc('portal_toggle_task', { p_task: s(fd, 'id') });
  back(`${base(fd)}/projects/${s(fd, 'project_id')}`, error ? undefined : 'Updated', error?.message);
}

export async function clientTransferSent(fd: FormData) {
  const { supabase, ws, contact } = await requirePortal(s(fd, 'slug')); const id = s(fd, 'id');
  const { error } = await supabase.rpc('portal_mark_transfer_sent', { p_invoice: id });
  if (error) back(`${base(fd)}/invoices/${id}`, undefined, error.message);
  if (ws.email) await sendEmail({ to: ws.email, subject: `${contact.name} sent a bank transfer`, heading: 'Check for a transfer', lines: [`${contact.name} says they've paid by bank transfer. Check your account, then record the payment.`], button: { label: 'Open the invoice', url: `${env.appUrl}/s/${ws.slug}/invoices/${id}` }, studio: { name: 'Onera' } });
  back(`${base(fd)}/invoices/${id}`, 'Thanks. The studio will confirm once it arrives.');
}

/** Starts a Paystack checkout that settles to the studio's subaccount, with the platform fee taken in-flight. */
export async function startPayment(fd: FormData) {
  const { supabase, ws, contact, user } = await requirePortal(s(fd, 'slug')); const id = s(fd, 'id');
  const path = `${base(fd)}/invoices/${id}`;
  const { data: inv } = await supabase.from('invoices').select('*').eq('id', id).maybeSingle();
  if (!inv || !['sent', 'processing'].includes(inv.status)) back(path, undefined, 'This invoice can\'t be paid right now');
  if (!ws.paystack_subaccount_code) back(path, undefined, `${ws.name} hasn't set up card payments yet. Please pay by bank transfer.`);
  const t = await totalOf(supabase, id);
  const balance = Math.round((t.total - t.paid) * 100) / 100;
  if (balance <= 0) back(path, 'This invoice is already paid');
  const fee = inv.pass_fees && ws.pass_card_fees ? Math.round(balance * Number(ws.card_fee_pct)) / 100 : 0;
  const reference = `inv_${id.slice(0, 8)}_${Date.now()}`;
  await createAdminClient().from('payments').insert({ workspace_id: ws.id, invoice_id: id, amount: balance, fee: 0, method: 'Card', provider: 'paystack', reference, status: 'pending' });
  const h = await headers();
  let url = '';
  try {
    const tx = await initializeTransaction({
      email: contact.email || user.email!, amount: balance + fee, reference, currency: ws.currency, subaccount: ws.paystack_subaccount_code,
      platformFee: Math.round(balance * platformFeePct(ws.plan as PlanKey)) / 100,
      callbackUrl: `${env.appUrl}/api/paystack/callback`,
      metadata: { kind: 'invoice', invoice_id: id, workspace_id: ws.id, contact_id: contact.id, ip: h.get('x-forwarded-for'), custom_fields: [{ display_name: 'Invoice', variable_name: 'invoice', value: inv.number }] },
    });
    url = tx.authorization_url;
  } catch (e) { back(path, undefined, 'Card checkout is unavailable: ' + (e as Error).message); }
  redirect(url);
}

export async function clientSign(fd: FormData) {
  const { supabase, ws, contact } = await requirePortal(s(fd, 'slug')); const id = s(fd, 'id'); const path = `${base(fd)}/contracts/${id}`;
  if (fd.get('agree') !== 'on') back(path, undefined, 'Tick the box to agree to sign electronically');
  const kind = s(fd, 'kind') === 'drawn' ? 'drawn' : 'typed';
  const signature = kind === 'drawn' ? s(fd, 'drawing') : s(fd, 'typed');
  if (kind === 'drawn' && !signature.startsWith('data:image/png;base64,')) back(path, undefined, 'Draw your signature in the box first');
  if (signature.length > 300_000) back(path, undefined, 'That signature image is too large. Clear it and draw again.');
  const h = await headers();
  const { error } = await supabase.rpc('portal_sign_contract', { p_contract: id, p_name: s(fd, 'name') || contact.name, p_signature: signature, p_kind: kind, p_ip: (h.get('x-forwarded-for') || '').split(',')[0].trim(), p_ua: h.get('user-agent') || '' });
  if (error) back(path, undefined, error.message);
  if (ws.email) await sendEmail({ to: ws.email, subject: `${contact.name} signed the agreement`, heading: 'Agreement signed', lines: [`${contact.name} signed the contract just now.`], button: { label: 'View it', url: `${env.appUrl}/s/${ws.slug}/contracts/${id}` }, studio: { name: 'Onera' } });
  let next = '';
  try { const inv = await sendFirstDraftOnSign(id); if (inv) next = `${base(fd)}/invoices/${inv}`; } catch (e) { console.error('[auto] send on sign', e); }
  if (next) back(next, 'Signed, thank you. Your first invoice is ready below.');
  back(path, 'Signed. A copy is saved here and you can download the PDF.');
}

export async function clientRequestChanges(fd: FormData) {
  const { supabase } = await requirePortal(s(fd, 'slug')); const id = s(fd, 'id'); const path = `${base(fd)}/contracts/${id}`;
  const { error } = await supabase.rpc('portal_request_changes', { p_contract: id, p_reason: s(fd, 'reason') });
  back(path, error ? undefined : 'Request sent to the studio', error?.message);
}

export async function clientProfile(fd: FormData) {
  const { supabase, contact } = await requirePortal(s(fd, 'slug'));
  const { error } = await supabase.rpc('portal_update_profile', { p_contact: contact.id, p_name: s(fd, 'name'), p_phone: s(fd, 'phone'), p_company: s(fd, 'company') });
  back(`${base(fd)}/account`, error ? undefined : 'Profile saved', error?.message);
}

export async function clientPassword(fd: FormData) {
  const { supabase } = await requirePortal(s(fd, 'slug'));
  const pw = String(fd.get('password') || '');
  if (pw.length < 8) back(`${base(fd)}/account`, undefined, 'Use at least 8 characters');
  const { error } = await supabase.auth.updateUser({ password: pw });
  back(`${base(fd)}/account`, error ? undefined : 'Password set. You can now sign in with it.', error?.message);
}

/* ---------- proofing ---------- */
export async function clientProofDecide(fd: FormData) {
  const { supabase, ws, contact } = await requirePortal(s(fd, 'slug')); const gid = s(fd, 'gallery_id'); const path = `${base(fd)}/galleries/${gid}`;
  const status = s(fd, 'status');
  const { error } = await supabase.rpc('portal_proof_decide', { p_item: s(fd, 'id'), p_status: status, p_comment: s(fd, 'comment') });
  if (error) back(path, undefined, error.message);
  const { data: g } = await supabase.from('galleries').select('title, status, project_id').eq('id', gid).single();
  if (g?.status === 'approved') await notifyStudio(ws, `${contact.name} approved ${g.title}`, 'Gallery approved', [`${contact.name} approved every image in "${g.title}".`], `/projects/${g.project_id}/galleries/${gid}`);
  else if (status === 'changes') await notifyStudio(ws, `${contact.name} asked for changes`, 'Changes requested', [`${contact.name} asked for changes in "${g?.title}":`, s(fd, 'comment').slice(0, 600)], `/projects/${g?.project_id}/galleries/${gid}`);
  back(path, g?.status === 'approved' ? 'Everything is approved. Thank you!' : status === 'approved' ? 'Approved' : status === 'changes' ? 'Sent to the studio' : 'Updated');
}

export async function clientApproveAll(fd: FormData) {
  const { supabase, ws, contact } = await requirePortal(s(fd, 'slug')); const gid = s(fd, 'gallery_id'); const path = `${base(fd)}/galleries/${gid}`;
  const { data: items } = await supabase.from('gallery_items').select('id').eq('gallery_id', gid).neq('status', 'approved');
  for (const it of items || []) {
    const { error } = await supabase.rpc('portal_proof_decide', { p_item: it.id, p_status: 'approved', p_comment: '' });
    if (error) back(path, undefined, error.message);
  }
  const { data: g } = await supabase.from('galleries').select('title, project_id').eq('id', gid).single();
  await notifyStudio(ws, `${contact.name} approved ${g?.title}`, 'Gallery approved', [`${contact.name} approved every image in "${g?.title}".`], `/projects/${g?.project_id}/galleries/${gid}`);
  back(path, 'Everything is approved. Thank you!');
}

export async function clientProofComment(fd: FormData) {
  const { supabase } = await requirePortal(s(fd, 'slug')); const gid = s(fd, 'gallery_id'); const path = `${base(fd)}/galleries/${gid}`;
  if (!s(fd, 'body')) back(path);
  const { error } = await supabase.rpc('portal_proof_comment', { p_item: s(fd, 'id'), p_body: s(fd, 'body') });
  back(path, error ? undefined : 'Comment sent', error?.message);
}

/* ---------- proposals ---------- */
export async function clientProposalDecide(fd: FormData) {
  const { supabase, ws, contact } = await requirePortal(s(fd, 'slug')); const id = s(fd, 'id'); const path = `${base(fd)}/proposals/${id}`;
  const accept = s(fd, 'decision') === 'accept';
  if (accept && fd.get('agree') !== 'on') back(path, undefined, 'Tick the box to accept the proposal');
  const { error } = await supabase.rpc('portal_proposal_decide', { p_proposal: id, p_accept: accept, p_name: s(fd, 'name'), p_reason: s(fd, 'reason') });
  if (error) back(path, undefined, error.message);
  if (!accept) {
    await notifyStudio(ws, `${contact.name} declined a proposal`, 'Proposal declined', [`${contact.name} declined your proposal.`, s(fd, 'reason') ? `Their note: ${s(fd, 'reason').slice(0, 600)}` : 'They didn\'t leave a note.'], `/proposals/${id}`);
    back(path, 'Thanks for letting us know.');
  }
  let next = path;
  try {
    const r = await convertAcceptedProposal(id);
    if (r.contractId) next = `${base(fd)}/contracts/${r.contractId}`; else if (r.invoiceId) next = `${base(fd)}/invoices/${r.invoiceId}`;
  } catch (e) { console.error('[proposal] convert failed', e); back(path, 'Accepted. The studio will send your agreement shortly.'); }
  back(next, 'Accepted, thank you! Next, review and sign the agreement.');
}
