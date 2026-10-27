# Onera

A multi-tenant client portal and studio CRM for creative studios. Any studio signs up, gets its own workspace, and gives each client a branded portal for their project, invoices, contracts, files and messages. Card payments go through Paystack and settle straight to the studio's bank account.

**Stack:** Next.js 15 (App Router, server actions) · React 19 · Supabase (Postgres, Auth, Storage, Realtime) · Paystack · Resend · pdf-lib

---

## What's included

| Area | Studio (`/s/<workspace>`) | Client portal (`/p/<workspace>`) |
|---|---|---|
| Accounts | Email + password or magic link sign-up, onboarding creates the workspace, team invites with owner/admin/member roles | Magic-link or password sign-in, only for contacts the studio invited |
| CRM | Contacts, lead pipeline (new → call → proposal → won/lost), convert a lead into a project with a contract and deposit invoice | Profile and password |
| Projects | Stages, tasks (internal or client-visible, assigned to the client), shared/private notes, files up to 2 GB | Progress steps, plan, notes from the studio, files with uploads |
| Invoices | Line items, VAT, numbering, send, reminders, record manual payments, void, duplicate, PDF | Pay by card (Paystack) or bank transfer ("I've sent it"), receipts, PDF |
| Contracts | Templates with variables, studio signature, send, revise, void, PDF with audit trail | Typed or drawn e-signature, request changes, signed PDF |
| Messages | Inbox of every client thread, realtime | Single thread with the studio, realtime |
| Settings | Studio details and brand colour, portal welcome text, Paystack payouts, invoice defaults, team, plan & billing | – |

Plans (Starter free / Studio / Agency) limit active projects and team seats, with a 14-day trial of everything. Your platform can take a per-plan percentage of each client payment through Paystack split payments.

| Proposals | Packages with details, VAT, deposit %, expiry, agreement template; send, remind, withdraw, duplicate; win rate | Read and accept with your name (or decline with a note). Accepting creates the project, sends the agreement already signed by the studio, and sends the deposit invoice |
| Proofing | Galleries per project, drag-and-drop images, share, remind, reply to comments, ask again | Approve each image, approve all, request changes, comment |
| Booking | Public page at `/b/<workspace>`: meeting types, weekly hours, time zone, notice, buffer; upcoming/past list, cancel with email | Guests pick a slot, get a confirmation with a Google Calendar link and a manage/cancel page. Each booking adds a lead |
| Automations | Daily: invoice reminders (3 days before, due day, 3 and 7 days late), contract nudges (3 and 7 days), meeting reminders the day before; send the first draft invoice when a contract is signed. Toggle in Settings → Automations | Emails with a link into the portal |
| Branding | Logo upload (Settings → Studio), brand colour | Logo on portal, booking page, documents |

The interface is light-only, in a sky-blue palette (`--sky #40A8FD` → `--mist #E6F4FF` → white, pills `#1677D2`), defined as tokens at the top of `src/app/globals.css`.

Not in this release: custom domains per studio, Google Calendar two-way sync, video-call link generation.

---

## 1. Set up Supabase

1. Create a project at [supabase.com](https://supabase.com).
2. Run the migrations, either with the CLI:
   ```bash
   npx supabase link --project-ref <your-ref>
   npx supabase db push
   ```
   or by pasting `supabase/migrations/20261026000001_schema.sql`, then `20261026000002_security.sql`, then `20261027000001_features.sql` into the SQL editor, in that order. The third file is safe to run again.
3. **Auth → URL configuration:** set Site URL to your `NEXT_PUBLIC_APP_URL` and add `<APP_URL>/auth/callback` and `<APP_URL>/auth/confirm` to the redirect allow-list.
4. **Auth → Email templates:** for "Magic link" and "Invite", point the link at `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=magiclink` (use `type=invite` for the invite template). This keeps links working across devices.
5. **Auth → SMTP:** add your own SMTP (Resend works) before going live; Supabase's built-in sender is rate-limited.

The migrations create all tables, row-level security, the `files` (private) and `logos` storage buckets, and turn on Realtime for messages. Every table is locked down by RLS: studio members see only their workspace; clients see only their own contact's sent invoices, sent contracts, visible tasks, shared notes and files, and their own messages. `supabase/tests/rls_test.sql` checks this (see Testing).

## 2. Configure the app

```bash
cp .env.example .env.local   # then fill it in
npm install
npm run dev                  # http://localhost:3000
```

| Variable | What it's for |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase → Settings → API |
| `SUPABASE_SERVICE_ROLE_KEY` | Server only. Used for webhooks, signed file URLs, invites and a few portal writes after access is checked |
| `NEXT_PUBLIC_APP_URL` | Public URL of the app, e.g. `https://app.onera.studio` |
| `PORTAL_ROOT_DOMAIN` | Optional. Set to `onera.studio` to serve portals at `<slug>.onera.studio` (see Domains) |
| `PAYSTACK_SECRET_KEY`, `NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY` | Your platform Paystack account |
| `PLATFORM_FEE_STARTER/STUDIO/AGENCY` | Your % of each client card payment, per plan |
| `PAYSTACK_PLAN_STUDIO/AGENCY` | Plan codes for studio subscriptions |
| `RESEND_API_KEY`, `EMAIL_FROM` | Transactional email. Leave empty in development: emails print to the server log and invite links appear in the UI with a Copy button |

### Try it with demo data

```bash
npm run seed:demo -- --owner you@studio.com --client you+client@gmail.com
```

No terminal? Sign up in the app first, then open `supabase/seed-demo.sql`, put your email (and a second email for the client) at the top, and run it in the Supabase SQL editor. It builds the same demo; invite the client from Adaeze Okafor's contact page to get their portal link.

Creates "Onera Studio" (`/s/onera`) with five contacts, three leads, three projects with tasks and notes, six invoices (paid, due, overdue, draft), a contract waiting for the client's signature and a message thread. `--client` becomes the portal login for the demo client, so you can open `/p/onera` in a private window and pay, sign and message as them. New users get the password `onera-demo-2026` (change with `--password`). Re-running replaces the demo workspace.

### Automations (daily job)

`vercel.json` schedules `GET /api/cron/daily` every day at 07:00 UTC. Add a `CRON_SECRET` environment variable in Vercel (any long random string); Vercel sends it automatically and the route rejects calls without it. To test by hand: `curl -H "Authorization: Bearer $CRON_SECRET" https://<APP_URL>/api/cron/daily`.

## 3. Set up Paystack

1. **Webhook:** Paystack Dashboard → Settings → API Keys & Webhooks → Webhook URL `https://<APP_URL>/api/paystack/webhook`. The handler checks the `x-paystack-signature` HMAC and is idempotent, so retries are safe. The browser callback (`/api/paystack/callback`) does the same settlement, so a payment is confirmed by whichever arrives first.
2. **Studio payouts:** each studio goes to Settings → Payments, picks its bank and enters its account number. The app verifies the account with Paystack and creates a **subaccount**. Client payments are split at checkout: the studio's subaccount receives the payment and pays Paystack's fee (`bearer: subaccount`), and your platform fee is taken with `transaction_charge`.
3. **Subscriptions:** create two monthly plans (Studio ₦25,000, Agency ₦60,000, or your own prices in `src/lib/plans.ts`) and put their codes in `PAYSTACK_PLAN_STUDIO` / `PAYSTACK_PLAN_AGENCY`. The webhook handles `subscription.create`, `charge.success`, `invoice.payment_failed` and `subscription.disable`.
4. Test with Paystack test keys and the test card `4084 0840 8408 4081` (any future expiry, CVV 408, PIN 0000, OTP 123456).

## 4. Domains and embedding

- **Simplest:** portals live at `<APP_URL>/p/<slug>`. Studios link to it from their website; Settings → Client portal gives a copyable "Client login" button snippet.
- **Subdomains:** set `PORTAL_ROOT_DOMAIN=onera.studio`, add a wildcard DNS record `*.onera.studio` and a wildcard domain on your host (Vercel supports this). The middleware rewrites `kola.onera.studio/invoices` to `/p/kola/invoices`. Session cookies are host-scoped, so clients sign in on the portal domain.

## 5. Deploy

Vercel is the shortest path: import the repo, add the environment variables, deploy. Any Node 20+ host works with `npm run build && npm start`. After deploying, update the Supabase redirect URLs and the Paystack webhook to the production URL.

---

## Project layout

```
supabase/
  migrations/            schema, then RLS + RPCs + storage
  tests/                 stub of Supabase's auth schema + RLS test script
scripts/seed-demo.mjs    demo workspace
src/
  middleware.ts          session refresh, portal subdomain rewrite
  lib/                   supabase clients, auth guards, paystack, email, pdf, plans, formatting
  components/            UI kit, documents (invoice/contract), file upload, signature pad
  app/
    page.tsx, login, signup, onboarding, invite/[token]   marketing + studio auth
    s/[ws]/              studio: home, leads, contacts, projects, invoices, contracts, inbox, search, settings
    p/[slug]/            client portal: login, overview, projects, invoices, contracts, files, messages, account
    api/                 paystack callback + webhook, file upload/download, invoice + contract PDFs
```

How a request is authorised: studio pages call `requireMember(slug)`, portal pages call `requirePortal(slug)` (which links the signed-in user to the invited contact on first visit via the `claim_portal_access` RPC). Both use the user's own Supabase session, so RLS applies to every query. Writes clients make (sign, toggle a task, mark a transfer sent, update profile) go through `security definer` RPCs that re-check ownership.

## Testing

```bash
npm run typecheck
npm run build
# RLS: against a scratch Postgres 15+ database
psql "$SCRATCH_DB" -f supabase/tests/stub_supabase.sql \
  -f supabase/migrations/20261026000001_schema.sql \
  -f supabase/migrations/20261026000002_security.sql \
  -f supabase/migrations/20261027000001_features.sql \
  -f supabase/tests/rls_test.sql
# galleries, proposals and client actions: run on a fresh database the same way, ending with
#   -f supabase/tests/features_test.sql
```

The RLS test signs in as a studio owner, a member of another studio, an invited client and a stranger, and checks each sees only what they should.

## Going live checklist

- [ ] Own SMTP in Supabase Auth and a verified sending domain in Resend
- [ ] Paystack live keys, webhook URL, plan codes
- [ ] `NEXT_PUBLIC_APP_URL` and Supabase redirect URLs set to production
- [ ] Supabase point-in-time recovery or daily backups on
- [ ] Terms, privacy policy and a support email on the marketing page
