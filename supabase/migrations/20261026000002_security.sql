-- Access rules. Studio members see everything in their workspace.
-- Portal clients only see what has been sent or shared with their own contact record.
-- Writes that clients make (signing, paying by transfer, ticking their tasks) go through
-- security definer functions that check ownership and state first.

-- ---------- helpers ----------
create or replace function public.is_member(ws uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from workspace_members m where m.workspace_id = ws and m.user_id = auth.uid());
$$;

create or replace function public.is_admin(ws uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from workspace_members m where m.workspace_id = ws and m.user_id = auth.uid() and m.role in ('owner', 'admin'));
$$;

create or replace function public.is_portal_contact(c uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from contacts k where k.id = c and k.portal_user_id = auth.uid() and k.portal_status = 'active');
$$;

create or replace function public.is_portal_workspace(ws uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from contacts k where k.workspace_id = ws and k.portal_user_id = auth.uid() and k.portal_status = 'active');
$$;

create or replace function public.can_view_project(pid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from projects p where p.id = pid
      and (public.is_member(p.workspace_id) or public.is_portal_contact(p.contact_id))
  );
$$;

create or replace function public.actor_name()
returns text language sql stable security definer set search_path = public as $$
  select coalesce((select full_name from profiles where id = auth.uid()), split_part(coalesce(auth.email(), 'Someone'), '@', 1));
$$;

-- ---------- workspace lifecycle ----------
create or replace function public.create_workspace(p_name text, p_slug text)
returns public.workspaces language plpgsql security definer set search_path = public, extensions as $$
declare w workspaces;
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  insert into workspaces (name, slug, legal_name, email, created_by)
    values (trim(p_name), lower(trim(p_slug)), trim(p_name), auth.email(), auth.uid())
    returning * into w;
  insert into workspace_members (workspace_id, user_id, role) values (w.id, auth.uid(), 'owner');
  insert into contract_templates (workspace_id, name, sections) values (w.id, 'Project agreement', jsonb_build_array(
    jsonb_build_object('heading', 'Scope', 'body', '{{studio.name}} will deliver {{project.service}} work for {{client.company}}: {{project.summary}} Final files will be delivered by {{project.due}}.'),
    jsonb_build_object('heading', 'Fees and payment', 'body', 'The total fee is {{project.value}}, paid as a 40% deposit to start, 30% at the concepts milestone and 30% at handoff. Invoices are due within {{studio.terms}} days.'),
    jsonb_build_object('heading', 'Revisions', 'body', 'Two rounds of revisions are included at each stage. Further rounds are billed at the studio''s hourly rate.'),
    jsonb_build_object('heading', 'Usage rights', 'body', 'Full usage rights transfer to {{client.company}} on receipt of final payment. {{studio.name}} may show the work in its portfolio after launch.'),
    jsonb_build_object('heading', 'Cancellation', 'body', 'Either party may end this agreement with 14 days written notice. Work completed to that date is billed, and the deposit is non-refundable.')
  ));
  insert into activity (workspace_id, actor_id, actor_name, kind, message) values (w.id, auth.uid(), public.actor_name(), 'workspace.created', 'created the workspace');
  return w;
end $$;

create or replace function public.next_number(p_ws uuid, p_kind text)
returns text language plpgsql security definer set search_path = public as $$
declare n int; prefix text;
begin
  if not public.is_member(p_ws) then raise exception 'Not a member of this workspace'; end if;
  insert into doc_counters (workspace_id, kind, last) values (p_ws, p_kind, 1)
    on conflict (workspace_id, kind) do update set last = doc_counters.last + 1
    returning last into n;
  prefix := case p_kind when 'invoice' then 'INV-' when 'contract' then 'CON-' when 'quote' then 'QTE-' else upper(left(p_kind, 3)) || '-' end;
  return prefix || lpad(n::text, 4, '0');
end $$;

create or replace function public.accept_workspace_invite(p_token text)
returns text language plpgsql security definer set search_path = public as $$
declare inv workspace_invites; s text;
begin
  select * into inv from workspace_invites where token = p_token and accepted_at is null;
  if inv.id is null then raise exception 'This invite has already been used or does not exist'; end if;
  if lower(inv.email) <> lower(coalesce(auth.email(), '')) then raise exception 'This invite was sent to %. Sign in with that email to accept it.', inv.email; end if;
  insert into workspace_members (workspace_id, user_id, role) values (inv.workspace_id, auth.uid(), inv.role)
    on conflict (workspace_id, user_id) do update set role = excluded.role;
  update workspace_invites set accepted_at = now() where id = inv.id;
  select slug into s from workspaces where id = inv.workspace_id;
  insert into activity (workspace_id, actor_id, actor_name, kind, message) values (inv.workspace_id, auth.uid(), public.actor_name(), 'team.joined', 'joined the team');
  return s;
end $$;

-- ---------- portal ----------
-- Links the signed-in user to the contact with the same email in that workspace.
-- Supabase verifies the email through the magic link, so the match is trustworthy.
create or replace function public.claim_portal_access(p_slug text)
returns uuid language plpgsql security definer set search_path = public as $$
declare cid uuid; ws uuid;
begin
  if auth.uid() is null then return null; end if;
  select id into ws from workspaces where slug = lower(p_slug);
  if ws is null then return null; end if;
  update contacts set portal_user_id = auth.uid(), portal_status = 'active', last_seen_at = now()
    where workspace_id = ws and lower(email) = lower(auth.email())
      and portal_status in ('invited', 'active')
      and (portal_user_id is null or portal_user_id = auth.uid())
    returning id into cid;
  return cid;
end $$;

create or replace function public.portal_update_profile(p_contact uuid, p_name text, p_phone text, p_company text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_portal_contact(p_contact) then raise exception 'Not allowed'; end if;
  update contacts set name = coalesce(nullif(trim(p_name), ''), name), phone = nullif(trim(p_phone), ''), company = nullif(trim(p_company), '') where id = p_contact;
end $$;

create or replace function public.portal_toggle_task(p_task uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare t tasks; p projects; d boolean;
begin
  select * into t from tasks where id = p_task;
  select * into p from projects where id = t.project_id;
  if t.id is null or not t.for_client or not t.visible or not public.is_portal_contact(p.contact_id) then raise exception 'Not allowed'; end if;
  update tasks set done = not done, done_at = case when done then null else now() end where id = p_task returning done into d;
  insert into activity (workspace_id, actor_id, actor_name, from_client, kind, entity_type, entity_id, message)
    values (t.workspace_id, auth.uid(), public.actor_name(), true, 'task.toggled', 'project', p.id, (case when d then 'completed “' else 'reopened “' end) || t.title || '”');
  return d;
end $$;

create or replace function public.portal_mark_transfer_sent(p_invoice uuid)
returns void language plpgsql security definer set search_path = public as $$
declare i invoices;
begin
  select * into i from invoices where id = p_invoice;
  if i.id is null or not public.is_portal_contact(i.contact_id) or i.status <> 'sent' then raise exception 'This invoice cannot be marked as sent'; end if;
  update invoices set status = 'processing', paid_method = 'Bank transfer' where id = p_invoice;
  insert into activity (workspace_id, actor_id, actor_name, from_client, kind, entity_type, entity_id, message)
    values (i.workspace_id, auth.uid(), public.actor_name(), true, 'invoice.transfer_sent', 'invoice', i.id, 'marked a bank transfer as sent for ' || i.number);
end $$;

create or replace function public.portal_sign_contract(p_contract uuid, p_name text, p_signature text, p_kind text, p_ip text, p_ua text)
returns public.contracts language plpgsql security definer set search_path = public, extensions as $$
declare c contracts;
begin
  select * into c from contracts where id = p_contract for update;
  if c.id is null or not public.is_portal_contact(c.contact_id) then raise exception 'Not allowed'; end if;
  if c.status <> 'sent' then raise exception 'This agreement is not waiting for a signature'; end if;
  if char_length(trim(coalesce(p_name, ''))) < 2 then raise exception 'Type your full name to sign'; end if;
  if p_kind not in ('typed', 'drawn') then raise exception 'Unknown signature type'; end if;
  update contracts set
    status = 'signed', client_signer_name = trim(p_name), client_signature = p_signature, client_signature_kind = p_kind,
    client_signed_at = now(), client_ip = left(p_ip, 64), client_user_agent = left(p_ua, 300),
    doc_hash = encode(extensions.digest(convert_to(c.body::text || '|' || coalesce(c.studio_signed_at::text, '') || '|' || trim(p_name) || '|' || now()::text, 'UTF8'), 'sha256'), 'hex')
  where id = p_contract returning * into c;
  insert into activity (workspace_id, actor_id, actor_name, from_client, kind, entity_type, entity_id, message)
    values (c.workspace_id, auth.uid(), trim(p_name), true, 'contract.signed', 'contract', c.id, 'signed ' || c.title || ' (' || c.number || ')');
  return c;
end $$;

create or replace function public.portal_request_changes(p_contract uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare c contracts;
begin
  select * into c from contracts where id = p_contract;
  if c.id is null or not public.is_portal_contact(c.contact_id) or c.status <> 'sent' then raise exception 'Not allowed'; end if;
  if char_length(trim(coalesce(p_reason, ''))) < 3 then raise exception 'Tell the studio what you''d like changed'; end if;
  update contracts set status = 'changes', change_request = trim(p_reason) where id = p_contract;
  insert into activity (workspace_id, actor_id, actor_name, from_client, kind, entity_type, entity_id, message)
    values (c.workspace_id, auth.uid(), public.actor_name(), true, 'contract.changes', 'contract', c.id, 'asked for changes to ' || c.title);
end $$;

-- ---------- row level security ----------
alter table public.profiles enable row level security;
alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
alter table public.workspace_invites enable row level security;
alter table public.doc_counters enable row level security;
alter table public.contacts enable row level security;
alter table public.leads enable row level security;
alter table public.projects enable row level security;
alter table public.tasks enable row level security;
alter table public.notes enable row level security;
alter table public.files enable row level security;
alter table public.invoices enable row level security;
alter table public.invoice_items enable row level security;
alter table public.payments enable row level security;
alter table public.contract_templates enable row level security;
alter table public.contracts enable row level security;
alter table public.messages enable row level security;
alter table public.activity enable row level security;

create policy "own profile" on public.profiles for all using (id = auth.uid()) with check (id = auth.uid());
create policy "teammates' profiles" on public.profiles for select using (
  exists (select 1 from workspace_members a join workspace_members b on a.workspace_id = b.workspace_id where a.user_id = auth.uid() and b.user_id = profiles.id));

create policy "members read workspace" on public.workspaces for select using (public.is_member(id) or public.is_portal_workspace(id));
create policy "admins update workspace" on public.workspaces for update using (public.is_admin(id)) with check (public.is_admin(id));

create policy "members read team" on public.workspace_members for select using (public.is_member(workspace_id));
create policy "admins change roles" on public.workspace_members for update using (public.is_admin(workspace_id) and role <> 'owner') with check (public.is_admin(workspace_id) and role <> 'owner');
create policy "admins remove members" on public.workspace_members for delete using (public.is_admin(workspace_id) and role <> 'owner');

create policy "admins manage invites" on public.workspace_invites for all using (public.is_admin(workspace_id)) with check (public.is_admin(workspace_id));

-- contacts: members manage, clients read their own record
create policy "members manage contacts" on public.contacts for all using (public.is_member(workspace_id)) with check (public.is_member(workspace_id));
create policy "client reads self" on public.contacts for select using (portal_user_id = auth.uid());

create policy "members manage leads" on public.leads for all using (public.is_member(workspace_id)) with check (public.is_member(workspace_id));

create policy "members manage projects" on public.projects for all using (public.is_member(workspace_id)) with check (public.is_member(workspace_id));
create policy "client reads own projects" on public.projects for select using (public.is_portal_contact(contact_id));

create policy "members manage tasks" on public.tasks for all using (public.is_member(workspace_id)) with check (public.is_member(workspace_id));
create policy "client reads visible tasks" on public.tasks for select using (
  visible and exists (select 1 from projects p where p.id = tasks.project_id and p.show_plan and public.is_portal_contact(p.contact_id)));

create policy "members manage notes" on public.notes for all using (public.is_member(workspace_id)) with check (public.is_member(workspace_id));
create policy "client reads shared notes" on public.notes for select using (shared and public.can_view_project(project_id));

create policy "members manage files" on public.files for all using (public.is_member(workspace_id)) with check (public.is_member(workspace_id));
create policy "client reads shared files" on public.files for select using (shared and public.can_view_project(project_id));
create policy "client uploads files" on public.files for insert with check (
  by_client and shared and uploaded_by = auth.uid()
  and exists (select 1 from projects p where p.id = files.project_id and p.workspace_id = files.workspace_id and public.is_portal_contact(p.contact_id)));

create policy "members manage invoices" on public.invoices for all using (public.is_member(workspace_id)) with check (public.is_member(workspace_id));
create policy "client reads sent invoices" on public.invoices for select using (status <> 'draft' and public.is_portal_contact(contact_id));

create policy "members manage invoice items" on public.invoice_items for all using (public.is_member(workspace_id)) with check (public.is_member(workspace_id));
create policy "client reads invoice items" on public.invoice_items for select using (
  exists (select 1 from invoices i where i.id = invoice_items.invoice_id and i.status <> 'draft' and public.is_portal_contact(i.contact_id)));

create policy "members read payments" on public.payments for select using (public.is_member(workspace_id));
create policy "members record payments" on public.payments for insert with check (public.is_member(workspace_id) and provider = 'manual');
create policy "client reads own payments" on public.payments for select using (
  exists (select 1 from invoices i where i.id = payments.invoice_id and public.is_portal_contact(i.contact_id)));

create policy "members manage templates" on public.contract_templates for all using (public.is_member(workspace_id)) with check (public.is_member(workspace_id));

create policy "members manage contracts" on public.contracts for all using (public.is_member(workspace_id)) with check (public.is_member(workspace_id));
create policy "client reads sent contracts" on public.contracts for select using (status <> 'draft' and public.is_portal_contact(contact_id));

create policy "members manage messages" on public.messages for all using (public.is_member(workspace_id)) with check (public.is_member(workspace_id));
create policy "client reads own messages" on public.messages for select using (public.is_portal_contact(contact_id));
create policy "client sends messages" on public.messages for insert with check (
  from_client and sender_id = auth.uid() and public.is_portal_contact(contact_id)
  and workspace_id = (select k.workspace_id from contacts k where k.id = contact_id));

create policy "members read activity" on public.activity for select using (public.is_member(workspace_id));
create policy "members log activity" on public.activity for insert with check (public.is_member(workspace_id) and actor_id = auth.uid() and not from_client);

-- doc_counters has no policies: only next_number() touches it.

-- ---------- grants on functions ----------
revoke execute on function public.create_workspace(text, text) from anon;
revoke execute on function public.next_number(uuid, text) from anon;
revoke execute on function public.accept_workspace_invite(text) from anon;
revoke execute on function public.claim_portal_access(text) from anon;
revoke execute on function public.portal_update_profile(uuid, text, text, text) from anon;
revoke execute on function public.portal_toggle_task(uuid) from anon;
revoke execute on function public.portal_mark_transfer_sent(uuid) from anon;
revoke execute on function public.portal_sign_contract(uuid, text, text, text, text, text) from anon;
revoke execute on function public.portal_request_changes(uuid, text) from anon;

-- new auth users get a profile row
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, full_name) values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)))
    on conflict (id) do nothing;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

-- realtime for the inbox and portal messages
do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.messages;
  end if;
end $$;

-- private storage bucket for project files; the app hands out short-lived signed URLs after checking access
do $$ begin
  if exists (select 1 from information_schema.tables where table_schema = 'storage' and table_name = 'buckets') then
    insert into storage.buckets (id, name, public, file_size_limit) values ('files', 'files', false, 2147483648) on conflict (id) do nothing;
    insert into storage.buckets (id, name, public, file_size_limit) values ('logos', 'logos', true, 5242880) on conflict (id) do nothing;
  end if;
end $$;
