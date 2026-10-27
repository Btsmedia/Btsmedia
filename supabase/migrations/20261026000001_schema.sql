-- Onera: multi-tenant client portal and studio CRM
-- Every studio is a workspace. Studio staff are workspace members. Clients are contacts
-- who sign in to the portal; their auth user is linked through contacts.portal_user_id.

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

-- ---------- enums ----------
create type public.member_role as enum ('owner', 'admin', 'member');
create type public.contact_type as enum ('client', 'lead', 'collaborator');
create type public.portal_status as enum ('none', 'invited', 'active');
create type public.lead_stage as enum ('new', 'call', 'proposal', 'won', 'lost');
create type public.project_status as enum ('active', 'on_hold', 'completed', 'archived');
create type public.invoice_status as enum ('draft', 'sent', 'processing', 'paid', 'void');
create type public.contract_status as enum ('draft', 'sent', 'changes', 'signed', 'void');

-- ---------- people and workspaces ----------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text,
  created_at timestamptz not null default now()
);

create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$'),
  name text not null check (char_length(name) between 2 and 80),
  legal_name text,
  email text,
  phone text,
  address text,
  company_number text,
  tax_id text,
  brand_color text not null default '#111214' check (brand_color ~ '^#[0-9A-Fa-f]{6}$'),
  logo_path text,
  currency text not null default 'NGN' check (currency in ('NGN', 'GHS', 'KES', 'ZAR', 'USD')),
  vat_rate numeric(5, 2) not null default 7.5 check (vat_rate >= 0 and vat_rate <= 50),
  pass_card_fees boolean not null default true,
  card_fee_pct numeric(5, 2) not null default 1.5,
  payment_terms_days int not null default 7 check (payment_terms_days between 0 and 90),
  bank_name text,
  bank_account_name text,
  bank_account_number text,
  paystack_subaccount_code text,
  portal_welcome text not null default 'Welcome to your client portal. Everything for your project lives here.',
  portal_show_plan boolean not null default true,
  plan text not null default 'starter' check (plan in ('starter', 'studio', 'agency')),
  plan_status text not null default 'trialing' check (plan_status in ('trialing', 'active', 'past_due', 'cancelled')),
  trial_ends_at timestamptz not null default (now() + interval '14 days'),
  paystack_customer_code text,
  paystack_subscription_code text,
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now()
);

create table public.workspace_members (
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role public.member_role not null default 'member',
  created_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);
create index on public.workspace_members (user_id);

create table public.workspace_invites (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  email text not null check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  role public.member_role not null default 'member' check (role <> 'owner'),
  token text not null unique default encode(extensions.gen_random_bytes(24), 'hex'),
  invited_by uuid references auth.users (id),
  accepted_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.doc_counters (
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  kind text not null,
  last int not null default 0,
  primary key (workspace_id, kind)
);

-- ---------- CRM ----------
create table public.contacts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  company text,
  role text,
  email text check (email is null or email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  phone text,
  city text,
  type public.contact_type not null default 'client',
  tags text[] not null default '{}',
  notes text not null default '',
  portal_user_id uuid references auth.users (id) on delete set null,
  portal_status public.portal_status not null default 'none',
  portal_invited_at timestamptz,
  last_seen_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index contacts_ws_email on public.contacts (workspace_id, lower(email)) where email is not null;
create index on public.contacts (portal_user_id);

create table public.leads (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  contact_id uuid not null references public.contacts (id) on delete cascade,
  service text not null,
  value numeric(14, 2) not null default 0 check (value >= 0),
  stage public.lead_stage not null default 'new',
  source text not null default 'Other',
  next_step text not null default '',
  notes text not null default '',
  project_id uuid,
  created_at timestamptz not null default now()
);
create index on public.leads (workspace_id, stage);

-- ---------- projects ----------
create table public.projects (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  contact_id uuid not null references public.contacts (id) on delete restrict,
  code text not null,
  name text not null check (char_length(name) between 2 and 120),
  service text not null default '',
  status public.project_status not null default 'active',
  stages text[] not null default array['Discovery', 'Concepts', 'Refine', 'Handoff'],
  stage int not null default 0 check (stage >= 0),
  start_date date not null default current_date,
  due_date date,
  value numeric(14, 2) not null default 0 check (value >= 0),
  summary text not null default '',
  show_plan boolean not null default true,
  created_at timestamptz not null default now(),
  unique (workspace_id, code)
);
alter table public.leads add constraint leads_project_fk foreign key (project_id) references public.projects (id) on delete set null;
create index on public.projects (workspace_id, status);
create index on public.projects (contact_id);

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 200),
  due_date date,
  done boolean not null default false,
  done_at timestamptz,
  assignee_id uuid references auth.users (id) on delete set null,
  for_client boolean not null default false,
  visible boolean not null default true,
  position int not null default 0,
  created_at timestamptz not null default now()
);
create index on public.tasks (project_id, position);

create table public.notes (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  author_id uuid references auth.users (id) on delete set null,
  body text not null check (char_length(body) between 1 and 5000),
  shared boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.files (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  name text not null,
  path text not null unique,
  size_bytes bigint not null default 0 check (size_bytes >= 0 and size_bytes <= 2147483648),
  mime text,
  uploaded_by uuid references auth.users (id) on delete set null,
  by_client boolean not null default false,
  shared boolean not null default true,
  created_at timestamptz not null default now()
);
create index on public.files (project_id);

-- ---------- billing ----------
create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  project_id uuid references public.projects (id) on delete set null,
  contact_id uuid not null references public.contacts (id) on delete restrict,
  number text not null,
  title text not null default 'Invoice',
  status public.invoice_status not null default 'draft',
  issued_on date,
  due_on date not null default (current_date + 7),
  vat boolean not null default false,
  pass_fees boolean not null default true,
  notes text not null default '',
  paid_on date,
  paid_method text,
  sent_to text,
  created_at timestamptz not null default now(),
  unique (workspace_id, number)
);
create index on public.invoices (workspace_id, status);
create index on public.invoices (contact_id);

create table public.invoice_items (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices (id) on delete cascade,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  description text not null default '',
  qty numeric(10, 2) not null default 1 check (qty >= 0),
  rate numeric(14, 2) not null default 0 check (rate >= 0),
  position int not null default 0
);
create index on public.invoice_items (invoice_id, position);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  invoice_id uuid not null references public.invoices (id) on delete cascade,
  amount numeric(14, 2) not null check (amount > 0),
  fee numeric(14, 2) not null default 0,
  method text not null,
  provider text not null default 'manual',
  reference text unique,
  status text not null default 'success' check (status in ('pending', 'success', 'failed')),
  paid_at timestamptz not null default now(),
  raw jsonb
);
create index on public.payments (invoice_id);

-- totals computed in one place; security_invoker makes the view obey the caller's RLS
create view public.invoice_totals with (security_invoker = true) as
select
  i.id as invoice_id,
  i.workspace_id,
  coalesce(sum(it.qty * it.rate), 0)::numeric(14, 2) as subtotal,
  (case when i.vat then round(coalesce(sum(it.qty * it.rate), 0) * w.vat_rate / 100, 2) else 0 end)::numeric(14, 2) as vat_amount,
  (coalesce(sum(it.qty * it.rate), 0) + case when i.vat then round(coalesce(sum(it.qty * it.rate), 0) * w.vat_rate / 100, 2) else 0 end)::numeric(14, 2) as total,
  (select coalesce(sum(p.amount), 0) from public.payments p where p.invoice_id = i.id and p.status = 'success')::numeric(14, 2) as paid,
  (i.status = 'sent' and i.due_on < current_date) as is_overdue
from public.invoices i
join public.workspaces w on w.id = i.workspace_id
left join public.invoice_items it on it.invoice_id = i.id
group by i.id, w.vat_rate;

-- ---------- contracts ----------
create table public.contract_templates (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  name text not null,
  sections jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create table public.contracts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  project_id uuid references public.projects (id) on delete set null,
  contact_id uuid not null references public.contacts (id) on delete restrict,
  template_id uuid references public.contract_templates (id) on delete set null,
  number text not null,
  title text not null default 'Project agreement',
  body jsonb not null default '[]'::jsonb,
  status public.contract_status not null default 'draft',
  sent_at timestamptz,
  studio_signer_id uuid references auth.users (id),
  studio_signer_name text,
  studio_signed_at timestamptz,
  client_signer_name text,
  client_signature text,
  client_signature_kind text check (client_signature_kind in ('typed', 'drawn')),
  client_signed_at timestamptz,
  client_ip text,
  client_user_agent text,
  doc_hash text,
  change_request text,
  created_at timestamptz not null default now(),
  unique (workspace_id, number)
);
create index on public.contracts (contact_id);

-- ---------- messages and activity ----------
create table public.messages (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  contact_id uuid not null references public.contacts (id) on delete cascade,
  sender_id uuid references auth.users (id) on delete set null,
  from_client boolean not null default false,
  body text not null check (char_length(body) between 1 and 8000),
  read_by_studio_at timestamptz,
  read_by_client_at timestamptz,
  created_at timestamptz not null default now()
);
create index on public.messages (workspace_id, contact_id, created_at);

create table public.activity (
  id bigint generated always as identity primary key,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  actor_id uuid references auth.users (id) on delete set null,
  actor_name text not null,
  from_client boolean not null default false,
  kind text not null,
  entity_type text,
  entity_id uuid,
  message text not null,
  created_at timestamptz not null default now()
);
create index on public.activity (workspace_id, created_at desc);
