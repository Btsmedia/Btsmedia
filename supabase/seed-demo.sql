-- Demo data for Onera, for running in the Supabase SQL editor (no terminal needed).
--
-- Needs all three migration files run first (including 20261027000001_features.sql).
-- 1. Sign up in the app first with your email (you can skip the "create your studio" step).
-- 2. Change the two emails below, paste this whole file into SQL Editor → New query, and click Run.
-- 3. Open <your app URL>/app. You'll land in "Onera Studio".
--
-- Re-running replaces the demo studio. The client gets portal access when you click
-- "Invite to portal" on Adaeze Okafor's contact page.

do $$
declare
  v_owner_email  text := 'you@gmail.com';          -- the email you signed up with
  v_client_email text := 'you+client@gmail.com';   -- a second address for the demo client
  v_slug text := 'onera';

  v_owner uuid; v_ws uuid; v_tpl uuid;
  c_ada uuid; c_kwame uuid; c_zainab uuid; c_femi uuid; c_ngozi uuid;
  p_kola uuid; p_tidal uuid; p_hau uuid;
  i1 uuid; i2 uuid; i3 uuid; i4 uuid; i5 uuid; i6 uuid;
  v_body jsonb;
begin
  select id into v_owner from auth.users where lower(email) = lower(v_owner_email);
  if v_owner is null then
    raise exception 'No account for %. Sign up in the app with that email first, then run this again.', v_owner_email;
  end if;

  -- replace an earlier demo
  select id into v_ws from public.workspaces where slug = v_slug;
  if v_ws is not null then
    delete from public.invoices where workspace_id = v_ws;
    delete from public.proposals where workspace_id = v_ws;
    delete from public.contracts where workspace_id = v_ws;
    delete from public.projects where workspace_id = v_ws;
    delete from public.contacts where workspace_id = v_ws;
    delete from public.workspaces where id = v_ws;
  end if;

  insert into public.workspaces (slug, name, legal_name, email, phone, address, company_number, tax_id, brand_color,
    bank_name, bank_account_name, bank_account_number, portal_welcome, plan, plan_status, created_by)
  values (v_slug, 'Onera Studio', 'Onera Studio Ltd', v_owner_email, '+234 803 000 0000', '12 Admiralty Way, Lekki Phase 1, Lagos',
    'RC 1789345', '24981133-0001', '#1677D2', 'Guaranty Trust Bank', 'Onera Studio Ltd', '0123456789',
    'Welcome to your Onera portal. Your project, invoices, contracts and files all live here.', 'studio', 'trialing', v_owner)
  returning id into v_ws;
  insert into public.workspace_members (workspace_id, user_id, role) values (v_ws, v_owner, 'owner');

  insert into public.contract_templates (workspace_id, name, sections) values (v_ws, 'Project agreement', jsonb_build_array(
    jsonb_build_object('heading', 'Scope', 'body', '{{studio.name}} will deliver {{project.service}} work for {{client.company}}: {{project.summary}} Final files will be delivered by {{project.due}}.'),
    jsonb_build_object('heading', 'Fees and payment', 'body', 'The total fee is {{project.value}}, paid as a 40% deposit to start, 30% at the concepts milestone and 30% at handoff. Invoices are due within {{studio.terms}} days.'),
    jsonb_build_object('heading', 'Revisions', 'body', 'Two rounds of revisions are included at each stage. Further rounds are billed at the studio''s hourly rate.'),
    jsonb_build_object('heading', 'Usage rights', 'body', 'Full usage rights transfer to {{client.company}} on receipt of final payment. {{studio.name}} may show the work in its portfolio after launch.'),
    jsonb_build_object('heading', 'Cancellation', 'body', 'Either party may end this agreement with 14 days written notice. Work completed to that date is billed, and the deposit is non-refundable.')
  )) returning id into v_tpl;

  -- contacts
  insert into public.contacts (workspace_id, name, company, role, email, phone, city, tags)
    values (v_ws, 'Adaeze Okafor', 'Kola Foods', 'Head of Marketing', v_client_email, '+234 809 111 2233', 'Lagos', '{FMCG,Retainer}') returning id into c_ada;
  insert into public.contacts (workspace_id, name, company, role, email, city, tags)
    values (v_ws, 'Kwame Mensah', 'Tidal Pay', 'Founder', 'kwame@tidalpay.example', 'Accra', '{Fintech}') returning id into c_kwame;
  insert into public.contacts (workspace_id, name, company, role, email, city, tags)
    values (v_ws, 'Zainab Bello', 'Hausa Hues', 'Creative Director', 'zainab@hausahues.example', 'Abuja', '{Fashion}') returning id into c_zainab;
  insert into public.contacts (workspace_id, name, company, email, city, type)
    values (v_ws, 'Femi Johnson', 'Lagos Light Co.', 'femi@lagoslight.example', 'Lagos', 'lead') returning id into c_femi;
  insert into public.contacts (workspace_id, name, company, email, city, type)
    values (v_ws, 'Ngozi Eze', 'Eze & Partners', 'ngozi@ezepartners.example', 'Enugu', 'lead') returning id into c_ngozi;

  -- projects
  insert into public.projects (workspace_id, contact_id, code, name, service, stages, stage, start_date, due_date, value, summary)
    values (v_ws, c_ada, 'KOL-01', 'Kola Foods rebrand', 'Brand identity', '{Discovery,Concepts,Refine,Handoff}', 1, current_date - 24, current_date + 28, 4200000,
      'A new identity for Kola Foods: logo, colour, type, packaging system for three product lines, and brand guidelines.') returning id into p_kola;
  insert into public.projects (workspace_id, contact_id, code, name, service, stages, stage, start_date, due_date, value, summary)
    values (v_ws, c_kwame, 'TID-01', 'Tidal Pay launch site', 'Website', '{Discovery,Wireframes,Design,Build,Launch}', 3, current_date - 50, current_date + 12, 6500000,
      'Marketing site for Tidal Pay''s public launch, built in Webflow with a CMS for the blog and press pages.') returning id into p_tidal;
  insert into public.projects (workspace_id, contact_id, code, name, service, stages, stage, status, start_date, due_date, value, summary)
    values (v_ws, c_zainab, 'HAU-01', 'Harmattan lookbook', 'Art direction', '{Brief,Shoot,Edit,Deliver}', 3, 'completed', current_date - 90, current_date - 30, 2800000,
      'Art direction and editing for the Harmattan 2026 lookbook.') returning id into p_hau;

  insert into public.tasks (workspace_id, project_id, title, position, done, done_at, for_client, visible, due_date) values
    (v_ws, p_kola, 'Kick-off call and brand questionnaire', 0, true, now() - interval '22 days', false, true, null),
    (v_ws, p_kola, 'Send brand assets and current packaging', 1, true, now() - interval '20 days', true, true, null),
    (v_ws, p_kola, 'Mood boards and positioning', 2, true, now() - interval '12 days', false, true, null),
    (v_ws, p_kola, 'Three logo concepts', 3, false, null, false, true, current_date + 4),
    (v_ws, p_kola, 'Feedback on concepts', 4, false, null, true, true, current_date + 9),
    (v_ws, p_kola, 'Refine chosen route', 5, false, null, false, true, current_date + 16),
    (v_ws, p_kola, 'Packaging mockups', 6, false, null, false, true, current_date + 22),
    (v_ws, p_kola, 'Internal pricing check', 7, false, null, false, false, null),
    (v_ws, p_kola, 'Guidelines and file handoff', 8, false, null, false, true, current_date + 28),
    (v_ws, p_tidal, 'Sitemap and wireframes', 0, true, now() - interval '35 days', false, true, null),
    (v_ws, p_tidal, 'Approve homepage design', 1, true, now() - interval '18 days', true, true, null),
    (v_ws, p_tidal, 'Build CMS collections', 2, true, now() - interval '6 days', false, true, null),
    (v_ws, p_tidal, 'Send final legal copy', 3, false, null, true, true, current_date + 3),
    (v_ws, p_tidal, 'QA on mobile', 4, false, null, false, true, current_date + 8),
    (v_ws, p_tidal, 'Connect domain and launch', 5, false, null, false, true, current_date + 12);

  insert into public.notes (workspace_id, project_id, author_id, shared, body, created_at) values
    (v_ws, p_kola, v_owner, true, 'Thanks for the packaging samples. The research is done and we''re now drawing concepts. Expect three directions in your portal by Friday.', now() - interval '3 days'),
    (v_ws, p_kola, v_owner, false, 'Client prefers warmer palettes; avoid anything that reads too "corporate". Budget for a fourth concept if needed.', now() - interval '10 days'),
    (v_ws, p_tidal, v_owner, true, 'Staging link is live. We''re waiting on final copy for the Terms and Privacy pages.', now() - interval '2 days');

  -- invoices (VAT on, 7.5%)
  insert into public.invoices (workspace_id, project_id, contact_id, number, title, status, vat, issued_on, due_on, paid_on, paid_method)
    values (v_ws, p_kola, c_ada, 'INV-0001', 'Deposit (40%)', 'paid', true, current_date - 24, current_date - 17, current_date - 20, 'Card') returning id into i1;
  insert into public.invoices (workspace_id, project_id, contact_id, number, title, status, vat, issued_on, due_on)
    values (v_ws, p_kola, c_ada, 'INV-0002', 'Concepts milestone (30%)', 'sent', true, current_date - 2, current_date + 5) returning id into i2;
  insert into public.invoices (workspace_id, project_id, contact_id, number, title, status, vat, issued_on, due_on, paid_on, paid_method)
    values (v_ws, p_tidal, c_kwame, 'INV-0003', 'Design and build', 'paid', true, current_date - 30, current_date - 23, current_date - 25, 'Bank transfer') returning id into i3;
  insert into public.invoices (workspace_id, project_id, contact_id, number, title, status, vat, issued_on, due_on)
    values (v_ws, p_tidal, c_kwame, 'INV-0004', 'Launch balance', 'sent', true, current_date - 14, current_date - 4) returning id into i4;
  insert into public.invoices (workspace_id, project_id, contact_id, number, title, status, vat, issued_on, due_on, paid_on, paid_method)
    values (v_ws, p_hau, c_zainab, 'INV-0005', 'Lookbook', 'paid', true, current_date - 40, current_date - 33, current_date - 34, 'Card') returning id into i5;
  insert into public.invoices (workspace_id, project_id, contact_id, number, title, status, vat)
    values (v_ws, p_kola, c_ada, 'INV-0006', 'Handoff (30%)', 'draft', true) returning id into i6;

  insert into public.invoice_items (workspace_id, invoice_id, description, qty, rate, position) values
    (v_ws, i1, 'Brand identity: deposit', 1, 1680000, 0),
    (v_ws, i2, 'Brand identity: concepts milestone', 1, 1260000, 0),
    (v_ws, i3, 'Website design', 1, 3000000, 0),
    (v_ws, i3, 'Webflow build', 1, 2000000, 1),
    (v_ws, i4, 'Launch and QA', 1, 1500000, 0),
    (v_ws, i5, 'Art direction', 1, 1800000, 0),
    (v_ws, i5, 'Retouching (40 images)', 40, 25000, 1),
    (v_ws, i6, 'Brand identity: final payment', 1, 1260000, 0);

  insert into public.payments (workspace_id, invoice_id, amount, method, provider, reference, paid_at) values
    (v_ws, i1, 1806000, 'Card', 'paystack', 'seed_' || left(v_ws::text, 6) || '_1', now() - interval '20 days'),
    (v_ws, i3, 5375000, 'Bank transfer', 'manual', 'seed_' || left(v_ws::text, 6) || '_3', now() - interval '25 days'),
    (v_ws, i5, 3010000, 'Card', 'paystack', 'seed_' || left(v_ws::text, 6) || '_5', now() - interval '34 days');

  -- contracts: one waiting for the client, one signed
  v_body := jsonb_build_array(
    jsonb_build_object('heading', 'Scope', 'body', 'Onera Studio will deliver brand identity work for Kola Foods: a new identity, packaging system for three product lines, and brand guidelines. Final files will be delivered by ' || to_char(current_date + 28, 'DD Mon YYYY') || '.'),
    jsonb_build_object('heading', 'Fees and payment', 'body', 'The total fee is ₦4,200,000, paid as a 40% deposit to start, 30% at the concepts milestone and 30% at handoff. Invoices are due within 7 days.'),
    jsonb_build_object('heading', 'Revisions', 'body', 'Two rounds of revisions are included at each stage. Further rounds are billed at the studio''s hourly rate.'),
    jsonb_build_object('heading', 'Usage rights', 'body', 'Full usage rights transfer to Kola Foods on receipt of final payment. Onera Studio may show the work in its portfolio after launch.'),
    jsonb_build_object('heading', 'Cancellation', 'body', 'Either party may end this agreement with 14 days written notice. Work completed to that date is billed, and the deposit is non-refundable.')
  );
  insert into public.contracts (workspace_id, project_id, contact_id, template_id, number, title, body, status, sent_at, studio_signer_id, studio_signer_name, studio_signed_at)
    values (v_ws, p_kola, c_ada, v_tpl, 'CON-0001', 'Kola Foods rebrand agreement', v_body, 'sent', now() - interval '1 day', v_owner, 'Tolu Adebayo', now() - interval '1 day');
  insert into public.contracts (workspace_id, project_id, contact_id, template_id, number, title, body, status, sent_at, studio_signer_id, studio_signer_name, studio_signed_at,
      client_signer_name, client_signature, client_signature_kind, client_signed_at)
    values (v_ws, p_tidal, c_kwame, v_tpl, 'CON-0002', 'Tidal Pay website agreement', replace(v_body::text, 'Kola Foods', 'Tidal Pay')::jsonb, 'signed',
      now() - interval '52 days', v_owner, 'Tolu Adebayo', now() - interval '52 days', 'Kwame Mensah', 'Kwame Mensah', 'typed', now() - interval '51 days');

  insert into public.doc_counters (workspace_id, kind, last) values (v_ws, 'invoice', 6), (v_ws, 'contract', 2)
    on conflict (workspace_id, kind) do update set last = excluded.last;

  insert into public.leads (workspace_id, contact_id, service, value, stage, source, next_step) values
    (v_ws, c_femi, 'Brand identity', 3500000, 'call', 'Referral', 'Discovery call Thursday 2pm'),
    (v_ws, c_ngozi, 'Website', 5000000, 'proposal', 'Instagram', 'Follow up on proposal'),
    (v_ws, c_femi, 'Packaging', 1800000, 'new', 'Website form', '');

  insert into public.messages (workspace_id, contact_id, sender_id, from_client, body, created_at, read_by_client_at, read_by_studio_at) values
    (v_ws, c_ada, v_owner, false, 'Hi Adaeze, the mood boards are up in your portal. Let us know which direction feels most like Kola.', now() - interval '6 days', now() - interval '6 days', null),
    (v_ws, c_ada, null, true, 'Love the second one. The warm reds feel right for the jollof range.', now() - interval '5 days 20 hours', null, now() - interval '5 days 19 hours'),
    (v_ws, c_ada, v_owner, false, 'Perfect, we''ll push that route. The agreement is ready for your signature too, and the concepts invoice is in your portal.', now() - interval '1 day', null, null),
    (v_ws, c_kwame, null, true, 'Legal copy is coming tomorrow. Can we still launch on the 12th?', now() - interval '2 hours', null, null);

  insert into public.activity (workspace_id, actor_id, actor_name, from_client, kind, entity_type, entity_id, message, created_at) values
    (v_ws, v_owner, 'Tolu Adebayo', false, 'contract.sent', 'contract', null, 'sent Kola Foods rebrand agreement to Adaeze Okafor', now() - interval '1 day'),
    (v_ws, v_owner, 'Tolu Adebayo', false, 'invoice.sent', 'invoice', i2, 'sent INV-0002 to Adaeze Okafor', now() - interval '2 days'),
    (v_ws, null, 'Kwame Mensah', true, 'message', 'contact', c_kwame, 'sent a message', now() - interval '2 hours');

  -- booking page with two meeting types
  update public.workspaces set booking_enabled = true where id = v_ws;
  insert into public.booking_types (workspace_id, name, description, duration_min, position) values
    (v_ws, 'Discovery call', 'A quick call to understand your project, budget and timeline.', 30, 0),
    (v_ws, 'Project review', 'Walk through work in progress together.', 45, 1);
  insert into public.bookings (workspace_id, contact_id, title, starts_at, ends_at, name, email, company, notes)
    values (v_ws, c_femi, 'Discovery call', date_trunc('day', now()) + interval '2 days 10 hours', date_trunc('day', now()) + interval '2 days 10 hours 30 minutes', 'Femi Johnson', 'femi@lagoslight.example', 'Lagos Light Co.', 'New brand for our lighting store.');

  -- a proposal waiting for Ngozi, and one Adaeze already accepted
  declare v_q uuid; begin
    insert into public.proposals (workspace_id, contact_id, template_id, number, title, intro, service, status, sent_at, sent_by_name, valid_until)
      values (v_ws, c_ngozi, v_tpl, 'QTE-0001', 'Eze & Partners website', 'A clear, fast website that wins you consultations: five pages, a blog and a booking form.', 'Website', 'sent', now() - interval '3 days', 'Tolu Adebayo', current_date + 11) returning id into v_q;
    insert into public.proposal_items (workspace_id, proposal_id, description, detail, qty, rate, position) values
      (v_ws, v_q, 'Website design', 'Home, About, Services, Insights, Contact', 1, 2500000, 0),
      (v_ws, v_q, 'Build and launch', 'Webflow build, CMS, SEO basics and launch support', 1, 1800000, 1),
      (v_ws, v_q, 'Copywriting', 'Per page', 5, 140000, 2);
  end;
  insert into public.doc_counters (workspace_id, kind, last) values (v_ws, 'quote', 1)
    on conflict (workspace_id, kind) do update set last = excluded.last;

  raise notice 'Demo studio ready. Open /app in the app.';
end $$;
