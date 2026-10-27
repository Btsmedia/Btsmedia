-- Onera: proofing galleries, booking, proposals, automations, logo.
-- Run after 20261026000001_schema.sql and 20261026000002_security.sql.

-- ---------- workspace settings ----------
alter table public.workspaces
  add column if not exists booking_enabled boolean not null default false,
  add column if not exists booking_timezone text not null default 'Africa/Lagos',
  add column if not exists booking_hours jsonb not null default '{"1":["09:00","17:00"],"2":["09:00","17:00"],"3":["09:00","17:00"],"4":["09:00","17:00"],"5":["09:00","17:00"]}'::jsonb,
  add column if not exists booking_notice_hours int not null default 12 check (booking_notice_hours between 0 and 336),
  add column if not exists booking_window_days int not null default 30 check (booking_window_days between 1 and 180),
  add column if not exists booking_buffer_min int not null default 15 check (booking_buffer_min between 0 and 240),
  add column if not exists booking_intro text not null default 'Pick a time that suits you. You''ll get a confirmation by email.',
  add column if not exists auto_invoice_reminders boolean not null default true,
  add column if not exists auto_contract_reminders boolean not null default true,
  add column if not exists auto_send_on_sign boolean not null default true,
  add column if not exists auto_booking_reminders boolean not null default true;

alter table public.workspaces alter column brand_color set default '#1677D2';
update public.workspaces set brand_color = '#1677D2' where brand_color = '#111214';

-- ---------- proofing galleries ----------
do $$ begin
  create type public.gallery_status as enum ('draft', 'shared', 'approved');
  create type public.proof_status as enum ('pending', 'approved', 'changes');
  create type public.proposal_status as enum ('draft', 'sent', 'accepted', 'declined');
  create type public.booking_status as enum ('confirmed', 'cancelled');
exception when duplicate_object then null; end $$;

create table if not exists public.galleries (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 120),
  note text not null default '',
  status public.gallery_status not null default 'draft',
  shared_at timestamptz,
  approved_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists galleries_project on public.galleries (project_id);

create table if not exists public.gallery_items (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  gallery_id uuid not null references public.galleries (id) on delete cascade,
  name text not null,
  path text not null unique,
  mime text,
  size_bytes bigint not null default 0,
  position int not null default 0,
  status public.proof_status not null default 'pending',
  decided_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists gallery_items_gallery on public.gallery_items (gallery_id, position);

create table if not exists public.proof_comments (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  item_id uuid not null references public.gallery_items (id) on delete cascade,
  author_id uuid references auth.users (id) on delete set null,
  author_name text not null,
  from_client boolean not null default false,
  body text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now()
);
create index if not exists proof_comments_item on public.proof_comments (item_id, created_at);

-- ---------- booking ----------
create table if not exists public.booking_types (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  name text not null check (char_length(name) between 2 and 80),
  description text not null default '',
  duration_min int not null default 30 check (duration_min between 10 and 480),
  location text not null default 'Google Meet link sent by email',
  active boolean not null default true,
  position int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.bookings (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  type_id uuid references public.booking_types (id) on delete set null,
  contact_id uuid references public.contacts (id) on delete set null,
  lead_id uuid references public.leads (id) on delete set null,
  title text not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null check (ends_at > starts_at),
  name text not null,
  email text not null,
  phone text,
  company text,
  notes text not null default '',
  status public.booking_status not null default 'confirmed',
  manage_token text not null unique default encode(extensions.gen_random_bytes(18), 'hex'),
  reminded_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists bookings_ws_time on public.bookings (workspace_id, starts_at);

-- ---------- proposals ----------
create table if not exists public.proposals (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  contact_id uuid not null references public.contacts (id) on delete restrict,
  lead_id uuid references public.leads (id) on delete set null,
  project_id uuid references public.projects (id) on delete set null,
  template_id uuid references public.contract_templates (id) on delete set null,
  number text not null,
  title text not null default 'Proposal',
  intro text not null default '',
  service text not null default '',
  status public.proposal_status not null default 'draft',
  vat boolean not null default true,
  deposit_pct int not null default 40 check (deposit_pct between 0 and 100),
  valid_until date,
  sent_at timestamptz,
  sent_by_name text,
  decided_at timestamptz,
  accepted_name text,
  decline_reason text,
  contract_id uuid references public.contracts (id) on delete set null,
  invoice_id uuid references public.invoices (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (workspace_id, number)
);

create table if not exists public.proposal_items (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  proposal_id uuid not null references public.proposals (id) on delete cascade,
  description text not null default '',
  detail text not null default '',
  qty numeric(10, 2) not null default 1 check (qty >= 0),
  rate numeric(14, 2) not null default 0 check (rate >= 0),
  position int not null default 0
);

-- ---------- automations log (each reminder goes out once) ----------
create table if not exists public.reminder_log (
  id bigint generated always as identity primary key,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  entity_id uuid not null,
  kind text not null,
  sent_at timestamptz not null default now(),
  unique (entity_id, kind)
);

-- ---------- row level security ----------
alter table public.galleries enable row level security;
alter table public.gallery_items enable row level security;
alter table public.proof_comments enable row level security;
alter table public.booking_types enable row level security;
alter table public.bookings enable row level security;
alter table public.proposals enable row level security;
alter table public.proposal_items enable row level security;
alter table public.reminder_log enable row level security;

drop policy if exists "members manage galleries" on public.galleries;
create policy "members manage galleries" on public.galleries for all using (public.is_member(workspace_id)) with check (public.is_member(workspace_id));
drop policy if exists "clients read shared galleries" on public.galleries;
create policy "clients read shared galleries" on public.galleries for select using (
  status <> 'draft' and exists (select 1 from projects p where p.id = project_id and public.is_portal_contact(p.contact_id)));

drop policy if exists "members manage gallery items" on public.gallery_items;
create policy "members manage gallery items" on public.gallery_items for all using (public.is_member(workspace_id)) with check (public.is_member(workspace_id));
drop policy if exists "clients read shared gallery items" on public.gallery_items;
create policy "clients read shared gallery items" on public.gallery_items for select using (
  exists (select 1 from galleries g join projects p on p.id = g.project_id where g.id = gallery_id and g.status <> 'draft' and public.is_portal_contact(p.contact_id)));

drop policy if exists "members manage proof comments" on public.proof_comments;
create policy "members manage proof comments" on public.proof_comments for all using (public.is_member(workspace_id)) with check (public.is_member(workspace_id));
drop policy if exists "clients read proof comments" on public.proof_comments;
create policy "clients read proof comments" on public.proof_comments for select using (
  exists (select 1 from gallery_items i join galleries g on g.id = i.gallery_id join projects p on p.id = g.project_id
          where i.id = item_id and g.status <> 'draft' and public.is_portal_contact(p.contact_id)));

drop policy if exists "members manage booking types" on public.booking_types;
create policy "members manage booking types" on public.booking_types for all using (public.is_member(workspace_id)) with check (public.is_admin(workspace_id));
drop policy if exists "members manage bookings" on public.bookings;
create policy "members manage bookings" on public.bookings for all using (public.is_member(workspace_id)) with check (public.is_member(workspace_id));

drop policy if exists "members manage proposals" on public.proposals;
create policy "members manage proposals" on public.proposals for all using (public.is_member(workspace_id)) with check (public.is_member(workspace_id));
drop policy if exists "clients read their proposals" on public.proposals;
create policy "clients read their proposals" on public.proposals for select using (status <> 'draft' and public.is_portal_contact(contact_id));
drop policy if exists "members manage proposal items" on public.proposal_items;
create policy "members manage proposal items" on public.proposal_items for all using (public.is_member(workspace_id)) with check (public.is_member(workspace_id));
drop policy if exists "clients read proposal items" on public.proposal_items;
create policy "clients read proposal items" on public.proposal_items for select using (
  exists (select 1 from proposals q where q.id = proposal_id and q.status <> 'draft' and public.is_portal_contact(q.contact_id)));

drop policy if exists "members read reminder log" on public.reminder_log;
create policy "members read reminder log" on public.reminder_log for select using (public.is_member(workspace_id));

-- ---------- client actions (security definer, re-check ownership) ----------
create or replace function public.portal_proof_decide(p_item uuid, p_status text, p_comment text)
returns void language plpgsql security definer set search_path = public as $$
declare it gallery_items; g galleries; pr projects; c contacts;
begin
  select * into it from gallery_items where id = p_item;
  select * into g from galleries where id = it.gallery_id;
  select * into pr from projects where id = g.project_id;
  if it.id is null or g.status = 'draft' or not public.is_portal_contact(pr.contact_id) then raise exception 'You can''t review this image'; end if;
  if p_status not in ('approved', 'changes', 'pending') then raise exception 'Unknown decision'; end if;
  if p_status = 'changes' and coalesce(trim(p_comment), '') = '' then raise exception 'Tell the studio what to change'; end if;
  select * into c from contacts where id = pr.contact_id;
  update gallery_items set status = p_status::proof_status, decided_at = now() where id = p_item;
  if coalesce(trim(p_comment), '') <> '' then
    insert into proof_comments (workspace_id, item_id, author_id, author_name, from_client, body) values (it.workspace_id, p_item, auth.uid(), c.name, true, left(trim(p_comment), 2000));
  end if;
  if not exists (select 1 from gallery_items where gallery_id = g.id and status <> 'approved') then
    update galleries set status = 'approved', approved_at = now() where id = g.id;
  elsif g.status = 'approved' then
    update galleries set status = 'shared', approved_at = null where id = g.id;
  end if;
  insert into activity (workspace_id, actor_id, actor_name, from_client, kind, entity_type, entity_id, message)
    values (it.workspace_id, auth.uid(), c.name, true, 'proof.' || p_status, 'project', pr.id,
      case p_status when 'approved' then 'approved ' || it.name when 'changes' then 'asked for changes on ' || it.name else 'reopened ' || it.name end);
end $$;

create or replace function public.portal_proof_comment(p_item uuid, p_body text)
returns void language plpgsql security definer set search_path = public as $$
declare it gallery_items; g galleries; pr projects; c contacts;
begin
  select * into it from gallery_items where id = p_item;
  select * into g from galleries where id = it.gallery_id;
  select * into pr from projects where id = g.project_id;
  if it.id is null or g.status = 'draft' or not public.is_portal_contact(pr.contact_id) then raise exception 'You can''t comment on this image'; end if;
  if coalesce(trim(p_body), '') = '' then raise exception 'Write a comment first'; end if;
  select * into c from contacts where id = pr.contact_id;
  insert into proof_comments (workspace_id, item_id, author_id, author_name, from_client, body) values (it.workspace_id, p_item, auth.uid(), c.name, true, left(trim(p_body), 2000));
end $$;

create or replace function public.portal_proposal_decide(p_proposal uuid, p_accept boolean, p_name text, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare q proposals;
begin
  select * into q from proposals where id = p_proposal;
  if q.id is null or not public.is_portal_contact(q.contact_id) then raise exception 'Proposal not found'; end if;
  if q.status <> 'sent' then raise exception 'This proposal has already been answered'; end if;
  if q.valid_until is not null and q.valid_until < current_date then raise exception 'This proposal expired on %. Ask the studio for an updated one.', to_char(q.valid_until, 'DD Mon YYYY'); end if;
  if p_accept and char_length(coalesce(trim(p_name), '')) < 2 then raise exception 'Type your full name to accept'; end if;
  update proposals set status = case when p_accept then 'accepted'::proposal_status else 'declined'::proposal_status end,
    decided_at = now(), accepted_name = case when p_accept then trim(p_name) end, decline_reason = case when p_accept then null else left(coalesce(p_reason, ''), 2000) end
    where id = p_proposal;
  insert into activity (workspace_id, actor_id, actor_name, from_client, kind, entity_type, entity_id, message)
    values (q.workspace_id, auth.uid(), coalesce(trim(p_name), 'Client'), true, case when p_accept then 'proposal.accepted' else 'proposal.declined' end, 'proposal', q.id,
      case when p_accept then 'accepted ' || q.title else 'declined ' || q.title end);
end $$;

revoke execute on function public.portal_proof_decide(uuid, text, text) from anon;
revoke execute on function public.portal_proof_comment(uuid, text) from anon;
revoke execute on function public.portal_proposal_decide(uuid, boolean, text, text) from anon;

-- document numbers for server-side jobs (proposal acceptance, automations); service role only
create or replace function public.next_number_system(p_ws uuid, p_kind text)
returns text language plpgsql security definer set search_path = public as $$
declare n int; prefix text;
begin
  insert into doc_counters (workspace_id, kind, last) values (p_ws, p_kind, 1)
    on conflict (workspace_id, kind) do update set last = doc_counters.last + 1
    returning last into n;
  prefix := case p_kind when 'invoice' then 'INV-' when 'contract' then 'CON-' when 'quote' then 'QTE-' else upper(left(p_kind, 3)) || '-' end;
  return prefix || lpad(n::text, 4, '0');
end $$;
revoke execute on function public.next_number_system(uuid, text) from public, anon, authenticated;
grant execute on function public.next_number_system(uuid, text) to service_role;
