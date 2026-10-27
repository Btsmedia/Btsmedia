#!/usr/bin/env node
/**
 * Seeds a demo studio ("Onera Studio", slug "onera") with clients, leads, projects, invoices,
 * a contract waiting for signature and a message thread.
 *
 *   npm run seed:demo -- --owner you@studio.com [--client client@example.com] [--password secret123]
 *
 * --owner   Studio owner. Created with --password if the user doesn't exist yet.
 * --client  Optional. Becomes the portal login for the main demo client (Adaeze Okafor).
 *
 * Uses SUPABASE_SERVICE_ROLE_KEY from .env.local, so run it only against your own project.
 * Safe to re-run: it deletes and recreates the "onera" workspace.
 */
import { readFileSync, existsSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

for (const f of ['.env.local', '.env']) {
  if (!existsSync(f)) continue;
  for (const line of readFileSync(f, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}
const arg = (k) => { const i = process.argv.indexOf(`--${k}`); return i > -1 ? process.argv[i + 1] : undefined; };
const OWNER = arg('owner'), CLIENT = arg('client'), PASSWORD = arg('password') || 'onera-demo-2026';
const SLUG = arg('slug') || 'onera';
if (!OWNER) { console.error('Usage: npm run seed:demo -- --owner you@studio.com [--client client@example.com]'); process.exit(1); }
const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) { console.error('Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local'); process.exit(1); }
const db = createClient(url, key, { auth: { persistSession: false } });

const must = (r, what) => { if (r.error) { console.error(`✗ ${what}:`, r.error.message); process.exit(1); } return r.data; };
const day = (n) => { const d = new Date(); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const ago = (days, h = 10) => { const d = new Date(); d.setUTCDate(d.getUTCDate() - days); d.setUTCHours(h, 0, 0, 0); return d.toISOString(); };

async function userFor(email, name) {
  for (let page = 1; page < 50; page++) {
    const { data } = await db.auth.admin.listUsers({ page, perPage: 200 });
    const u = data?.users.find((x) => x.email?.toLowerCase() === email.toLowerCase());
    if (u) return u;
    if (!data || data.users.length < 200) break;
  }
  const r = await db.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true, user_metadata: { full_name: name } });
  console.log(`  created user ${email} (password: ${PASSWORD})`);
  return must(r, 'create user').user;
}

console.log('Seeding demo studio…');
const owner = await userFor(OWNER, 'Tolu Adebayo');
const clientUser = CLIENT ? await userFor(CLIENT, 'Adaeze Okafor') : null;
const old = await db.from('workspaces').select('id').eq('slug', SLUG).maybeSingle();
if (old.data) {
  // children with "on delete restrict" first
  for (const t of ['invoices', 'contracts', 'projects', 'contacts']) await db.from(t).delete().eq('workspace_id', old.data.id);
  must(await db.from('workspaces').delete().eq('id', old.data.id), 'remove old workspace');
}

const ws = must(await db.from('workspaces').insert({
  slug: SLUG, name: 'Onera Studio', legal_name: 'Onera Studio Ltd', email: OWNER, phone: '+234 803 000 0000',
  address: '12 Admiralty Way, Lekki Phase 1, Lagos', company_number: 'RC 1789345', tax_id: '24981133-0001',
  brand_color: '#2F4BFF', bank_name: 'Guaranty Trust Bank', bank_account_name: 'Onera Studio Ltd', bank_account_number: '0123456789',
  portal_welcome: 'Welcome to your Onera portal. Your project, invoices, contracts and files all live here.',
  plan: 'studio', plan_status: 'trialing', created_by: owner.id,
}).select().single(), 'workspace');
must(await db.from('workspace_members').insert({ workspace_id: ws.id, user_id: owner.id, role: 'owner' }), 'owner membership');
const W = { workspace_id: ws.id };

const tpl = must(await db.from('contract_templates').insert({ ...W, name: 'Project agreement', sections: [
  { heading: 'Scope', body: '{{studio.name}} will deliver {{project.service}} work for {{client.company}}: {{project.summary}} Final files will be delivered by {{project.due}}.' },
  { heading: 'Fees and payment', body: 'The total fee is {{project.value}}, paid as a 40% deposit to start, 30% at the concepts milestone and 30% at handoff. Invoices are due within {{studio.terms}} days.' },
  { heading: 'Revisions', body: 'Two rounds of revisions are included at each stage. Further rounds are billed at the studio\'s hourly rate.' },
  { heading: 'Usage rights', body: 'Full usage rights transfer to {{client.company}} on receipt of final payment. {{studio.name}} may show the work in its portfolio after launch.' },
  { heading: 'Cancellation', body: 'Either party may end this agreement with 14 days written notice. Work completed to that date is billed, and the deposit is non-refundable.' },
] }).select().single(), 'template');

const contacts = must(await db.from('contacts').insert([
  { ...W, name: 'Adaeze Okafor', company: 'Kola Foods', role: 'Head of Marketing', email: CLIENT || 'adaeze@kolafoods.example', phone: '+234 809 111 2233', city: 'Lagos', tags: ['FMCG', 'Retainer'], portal_status: clientUser ? 'active' : 'none', portal_user_id: clientUser?.id ?? null, portal_invited_at: clientUser ? ago(20) : null },
  { ...W, name: 'Kwame Mensah', company: 'Tidal Pay', role: 'Founder', email: 'kwame@tidalpay.example', city: 'Accra', tags: ['Fintech'] },
  { ...W, name: 'Zainab Bello', company: 'Hausa Hues', role: 'Creative Director', email: 'zainab@hausahues.example', city: 'Abuja', tags: ['Fashion'] },
  { ...W, name: 'Femi Johnson', company: 'Lagos Light Co.', email: 'femi@lagoslight.example', city: 'Lagos', type: 'lead' },
  { ...W, name: 'Ngozi Eze', company: 'Eze & Partners', email: 'ngozi@ezepartners.example', city: 'Enugu', type: 'lead' },
]).select(), 'contacts');
const [ada, kwame, zainab, femi, ngozi] = contacts;

const projects = must(await db.from('projects').insert([
  { ...W, contact_id: ada.id, code: 'KOL-01', name: 'Kola Foods rebrand', service: 'Brand identity', stages: ['Discovery', 'Concepts', 'Refine', 'Handoff'], stage: 1, start_date: day(-24), due_date: day(28), value: 4200000, summary: 'A new identity for Kola Foods: logo, colour, type, packaging system for three product lines, and brand guidelines.' },
  { ...W, contact_id: kwame.id, code: 'TID-01', name: 'Tidal Pay launch site', service: 'Website', stages: ['Discovery', 'Wireframes', 'Design', 'Build', 'Launch'], stage: 3, start_date: day(-50), due_date: day(12), value: 6500000, summary: 'Marketing site for Tidal Pay\'s public launch, built in Webflow with a CMS for the blog and press pages.' },
  { ...W, contact_id: zainab.id, code: 'HAU-01', name: 'Harmattan lookbook', service: 'Art direction', stages: ['Brief', 'Shoot', 'Edit', 'Deliver'], stage: 3, status: 'completed', start_date: day(-90), due_date: day(-30), value: 2800000, summary: 'Art direction and editing for the Harmattan 2026 lookbook.' },
]).select(), 'projects');
const [kola, tidal, hau] = projects;

const task = (p, title, i, extra = {}) => ({ ...W, project_id: p.id, title, position: i, ...extra });
must(await db.from('tasks').insert([
  task(kola, 'Kick-off call and brand questionnaire', 0, { done: true, done_at: ago(22) }),
  task(kola, 'Send brand assets and current packaging', 1, { for_client: true, done: true, done_at: ago(20) }),
  task(kola, 'Mood boards and positioning', 2, { done: true, done_at: ago(12) }),
  task(kola, 'Three logo concepts', 3, { due_date: day(4) }),
  task(kola, 'Feedback on concepts', 4, { for_client: true, due_date: day(9) }),
  task(kola, 'Refine chosen route', 5, { due_date: day(16) }),
  task(kola, 'Packaging mockups', 6, { due_date: day(22) }),
  task(kola, 'Internal pricing check', 7, { visible: false }),
  task(kola, 'Guidelines and file handoff', 8, { due_date: day(28) }),
  task(tidal, 'Sitemap and wireframes', 0, { done: true, done_at: ago(35) }),
  task(tidal, 'Approve homepage design', 1, { for_client: true, done: true, done_at: ago(18) }),
  task(tidal, 'Build CMS collections', 2, { done: true, done_at: ago(6) }),
  task(tidal, 'Send final legal copy', 3, { for_client: true, due_date: day(3) }),
  task(tidal, 'QA on mobile', 4, { due_date: day(8) }),
  task(tidal, 'Connect domain and launch', 5, { due_date: day(12) }),
]), 'tasks');
must(await db.from('notes').insert([
  { ...W, project_id: kola.id, author_id: owner.id, shared: true, body: 'Thanks for the packaging samples. The research is done and we\'re now drawing concepts. Expect three directions in your portal by Friday.', created_at: ago(3) },
  { ...W, project_id: kola.id, author_id: owner.id, shared: false, body: 'Client prefers warmer palettes; avoid anything that reads too "corporate". Budget for a fourth concept if needed.', created_at: ago(10) },
  { ...W, project_id: tidal.id, author_id: owner.id, shared: true, body: 'Staging link is live. We\'re waiting on final copy for the Terms and Privacy pages.', created_at: ago(2) },
]), 'notes');

const inv = async (p, c, number, title, status, items, extra = {}) => {
  const i = must(await db.from('invoices').insert({ ...W, project_id: p.id, contact_id: c.id, number, title, status, vat: true, ...extra }).select().single(), 'invoice ' + number);
  must(await db.from('invoice_items').insert(items.map(([description, qty, rate], k) => ({ ...W, invoice_id: i.id, description, qty, rate, position: k }))), 'items');
  return i;
};
const i1 = await inv(kola, ada, 'INV-0001', 'Deposit (40%)', 'paid', [['Brand identity: deposit', 1, 1680000]], { issued_on: day(-24), due_on: day(-17), paid_on: day(-20), paid_method: 'Card' });
await inv(kola, ada, 'INV-0002', 'Concepts milestone (30%)', 'sent', [['Brand identity: concepts milestone', 1, 1260000]], { issued_on: day(-2), due_on: day(5) });
const i3 = await inv(tidal, kwame, 'INV-0003', 'Design and build', 'paid', [['Website design', 1, 3000000], ['Webflow build', 1, 2000000]], { issued_on: day(-30), due_on: day(-23), paid_on: day(-25), paid_method: 'Bank transfer' });
await inv(tidal, kwame, 'INV-0004', 'Launch balance', 'sent', [['Launch and QA', 1, 1500000]], { issued_on: day(-14), due_on: day(-4) });
const i5 = await inv(hau, zainab, 'INV-0005', 'Lookbook', 'paid', [['Art direction', 1, 1800000], ['Retouching (40 images)', 40, 25000]], { issued_on: day(-40), due_on: day(-33), paid_on: day(-34), paid_method: 'Card' });
await inv(kola, ada, 'INV-0006', 'Handoff (30%)', 'draft', [['Brand identity: final payment', 1, 1260000]]);
const vat = (n) => Math.round(n * 1.075 * 100) / 100;
must(await db.from('payments').insert([
  { ...W, invoice_id: i1.id, amount: vat(1680000), method: 'Card', provider: 'paystack', reference: `seed_${ws.id.slice(0, 6)}_1`, paid_at: ago(20) },
  { ...W, invoice_id: i3.id, amount: vat(5000000), method: 'Bank transfer', reference: `seed_${ws.id.slice(0, 6)}_3`, paid_at: ago(25) },
  { ...W, invoice_id: i5.id, amount: vat(2800000), method: 'Card', provider: 'paystack', reference: `seed_${ws.id.slice(0, 6)}_5`, paid_at: ago(34) },
]), 'payments');

const body = tpl.sections.map((s) => ({ heading: s.heading, body: s.body
  .replaceAll('{{studio.name}}', 'Onera Studio').replaceAll('{{client.company}}', 'Kola Foods').replaceAll('{{project.service}}', 'brand identity')
  .replaceAll('{{project.summary}}', kola.summary).replaceAll('{{project.due}}', day(28)).replaceAll('{{project.value}}', '₦4,200,000').replaceAll('{{studio.terms}}', '7') }));
must(await db.from('contracts').insert([
  { ...W, project_id: kola.id, contact_id: ada.id, template_id: tpl.id, number: 'CON-0001', title: 'Kola Foods rebrand agreement', body, status: 'sent', sent_at: ago(1), studio_signer_id: owner.id, studio_signer_name: 'Tolu Adebayo', studio_signed_at: ago(1) },
  { ...W, project_id: tidal.id, contact_id: kwame.id, template_id: tpl.id, number: 'CON-0002', title: 'Tidal Pay website agreement', body: body.map((s) => ({ ...s, body: s.body.replaceAll('Kola Foods', 'Tidal Pay') })), status: 'signed', sent_at: ago(52), studio_signer_id: owner.id, studio_signer_name: 'Tolu Adebayo', studio_signed_at: ago(52), client_signer_name: 'Kwame Mensah', client_signature: 'Kwame Mensah', client_signature_kind: 'typed', client_signed_at: ago(51) },
]), 'contracts');
must(await db.from('doc_counters').upsert([{ ...W, kind: 'invoice', last: 6 }, { ...W, kind: 'contract', last: 2 }]), 'counters');

must(await db.from('leads').insert([
  { ...W, contact_id: femi.id, service: 'Brand identity', value: 3500000, stage: 'call', source: 'Referral', next_step: 'Discovery call Thursday 2pm' },
  { ...W, contact_id: ngozi.id, service: 'Website', value: 5000000, stage: 'proposal', source: 'Instagram', next_step: 'Follow up on proposal' },
  { ...W, contact_id: femi.id, service: 'Packaging', value: 1800000, stage: 'new', source: 'Website form' },
]), 'leads');

must(await db.from('messages').insert([
  { ...W, contact_id: ada.id, sender_id: owner.id, from_client: false, body: 'Hi Adaeze, the mood boards are up in your portal. Let us know which direction feels most like Kola.', created_at: ago(6, 9), read_by_client_at: ago(6, 11) },
  { ...W, contact_id: ada.id, from_client: true, body: 'Love the second one. The warm reds feel right for the jollof range.', created_at: ago(6, 12), read_by_studio_at: ago(6, 13) },
  { ...W, contact_id: ada.id, sender_id: owner.id, from_client: false, body: 'Perfect, we\'ll push that route. The agreement is ready for your signature too, and the concepts invoice is in your portal.', created_at: ago(1, 15) },
  { ...W, contact_id: kwame.id, from_client: true, body: 'Legal copy is coming tomorrow. Can we still launch on the 12th?', created_at: ago(0, 8) },
]), 'messages');
must(await db.from('activity').insert([
  { ...W, actor_id: owner.id, actor_name: 'Tolu Adebayo', kind: 'contract.sent', entity_type: 'contract', message: 'sent Kola Foods rebrand agreement to Adaeze Okafor', created_at: ago(1, 15) },
  { ...W, actor_id: owner.id, actor_name: 'Tolu Adebayo', kind: 'invoice.sent', entity_type: 'invoice', message: 'sent INV-0002 to Adaeze Okafor', created_at: ago(2, 10) },
  { ...W, actor_name: 'Kwame Mensah', from_client: true, kind: 'message', entity_type: 'contact', entity_id: kwame.id, message: 'sent a message', created_at: ago(0, 8) },
]), 'activity');

const app = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
console.log(`\n✓ Done. Studio: ${app}/s/${SLUG}  (sign in as ${OWNER})`);
console.log(`  Portal: ${app}/p/${SLUG}${CLIENT ? `  (sign in as ${CLIENT}; new users get the password above)` : '  (re-run with --client you+client@example.com to try it)'}`);
