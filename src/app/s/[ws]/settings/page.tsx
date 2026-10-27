import { requireMember } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { Avatar, Card, Chip, Field, Hidden, Notice, PageHead, Tabs, Toggle } from '@/components/ui';
import { ConfirmSubmit, CopyButton, Submit } from '@/components/client';
import { Icon } from '@/components/Icon';
import { BankSelect } from '@/components/BankSelect';
import { connectPaystack, inviteMember, saveSettings, startSubscription, teamAction } from '../actions';
import { saveAutomations, uploadLogo } from '../more-actions';
import { StudioMark } from '@/components/docs';
import { listBanks } from '@/lib/paystack';
import { PLANS, platformFeePct, type PlanKey } from '@/lib/plans';
import { env, portalUrl } from '@/lib/env';
import { dateY, money } from '@/lib/format';

export const metadata = { title: 'Settings' };

const CURRENCIES = [['NGN', 'Nigerian naira'], ['GHS', 'Ghanaian cedi'], ['KES', 'Kenyan shilling'], ['ZAR', 'South African rand'], ['USD', 'US dollar']];

export default async function Settings({ params, searchParams }: { params: Promise<{ ws: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { ws: slug } = await params; const sp = await searchParams;
  const { supabase, ws, role, user } = await requireMember(slug);
  const tab = ['studio', 'portal', 'payments', 'automations', 'team', 'billing'].includes(sp.tab || '') ? sp.tab! : 'studio';
  const canEdit = role !== 'member';
  const b = `/s/${slug}/settings`;
  const Save = ({ label = 'Save changes' }: { label?: string }) => canEdit ? <div className="row"><span className="sp" /><Submit pending="Saving…">{label}</Submit></div> : <p className="muted xs">Only owners and admins can change these settings.</p>;

  return (
    <div className="page page-narrow">
      <PageHead eyebrow={ws.name} title="Settings" />
      {sp.welcome && <Notice tone="good" icon="star"><div className="col g6"><b>Welcome to Onera. Your studio is ready.</b><span>Three things get you to your first paid invoice: check your studio details below, add your bank account under Payments, then invite your first client from Contacts.</span></div></Notice>}
      <Tabs base={b} active={tab} items={[['studio', 'Studio'], ['portal', 'Client portal'], ['payments', 'Payments'], ['automations', 'Automations'], ['team', 'Team'], ['billing', 'Plan']]} />

      {tab === 'studio' && (
        <Card title="Studio details" icon="gear">
          <form action={saveSettings} className="col g12"><Hidden v={{ ws: slug, tab }} />
            <p className="muted small">These appear on invoices, contracts and your client portal.</p>
            <div className="fields">
              <Field label="Studio name"><input className="inp" name="name" id="st-name" defaultValue={ws.name} required /></Field>
              <Field label="Legal name" optional><input className="inp" name="legal_name" id="st-legal" defaultValue={ws.legal_name || ''} placeholder="e.g. Onera Studio Ltd" /></Field>
              <Field label="Email for client replies" hint="Where new-message and payment alerts go"><input className="inp" type="email" name="email" id="st-email" defaultValue={ws.email || ''} /></Field>
              <Field label="Phone" optional><input className="inp" name="phone" id="st-phone" defaultValue={ws.phone || ''} /></Field>
              <Field label="RC number" optional><input className="inp" name="company_number" id="st-rc" defaultValue={ws.company_number || ''} /></Field>
              <Field label="Tax ID (TIN)" optional><input className="inp" name="tax_id" id="st-tin" defaultValue={ws.tax_id || ''} /></Field>
            </div>
            <Field label="Address" optional><textarea className="inp ta" name="address" id="st-address" rows={2} defaultValue={ws.address || ''} /></Field>
            <Field label="Brand colour" hint="Used for your logo mark, portal sign-in and buttons clients see"><div className="row"><input type="color" name="brand_color" id="st-color" defaultValue={ws.brand_color} style={{ width: 44, height: 36, border: 0, background: 'none', padding: 0 }} /><span className="mono xs">{ws.brand_color}</span></div></Field>
            <Save />
          </form>
        </Card>
      )}

      {tab === 'studio' && (
        <Card title="Logo" icon="image">
          <div className="row"><StudioMark ws={ws} /><p className="muted small grow">Shown on your client portal, booking page, invoices and proposals. A wide PNG or SVG on a transparent background works best.</p></div>
          {canEdit && <form action={uploadLogo} className="row wrap"><Hidden v={{ ws: slug }} /><input type="file" name="logo" accept="image/png,image/jpeg,image/webp,image/svg+xml" required className="small" aria-label="Logo file" /><span className="sp" />
            <Submit className="btn" pending="Uploading…"><Icon name="upload" />Upload logo</Submit></form>}
          {canEdit && ws.logo_path && <form action={uploadLogo}><Hidden v={{ ws: slug, op: 'remove' }} /><button className="btn ghost sm">Remove logo</button></form>}
        </Card>
      )}

      {tab === 'automations' && (
        <Card title="Automations" icon="bolt">
          <form action={saveAutomations} className="col g12"><Hidden v={{ ws: slug }} />
            <p className="muted small">These run once a day and never send the same reminder twice. Each one is recorded in the project or invoice activity.</p>
            <div className="setrow"><div className="grow"><b>Invoice reminders</b><p>Email the client 3 days before the due date, on the day, then 3 and 7 days late.</p></div><Toggle name="auto_invoice_reminders" on={ws.auto_invoice_reminders} label="Invoice reminders" /></div>
            <div className="setrow"><div className="grow"><b>Contract nudges</b><p>Remind the client 3 and 7 days after sending an agreement they haven&apos;t signed.</p></div><Toggle name="auto_contract_reminders" on={ws.auto_contract_reminders} label="Contract nudges" /></div>
            <div className="setrow"><div className="grow"><b>Send the first invoice when a contract is signed</b><p>The project&apos;s earliest draft invoice goes out the moment the client signs.</p></div><Toggle name="auto_send_on_sign" on={ws.auto_send_on_sign} label="Send the first invoice on signing" /></div>
            <div className="setrow"><div className="grow"><b>Meeting reminders</b><p>Email guests the day before a booked call, with a link to reschedule.</p></div><Toggle name="auto_booking_reminders" on={ws.auto_booking_reminders} label="Meeting reminders" /></div>
            <div className="setrow"><div className="grow"><b>Proposal accepted → project, agreement and deposit</b><p>Always on. Accepting a proposal creates the project, sends the agreement signed by you, and sends the deposit invoice.</p></div><span className="chip good">Always on</span></div>
            <Save label="Save automations" />
          </form>
        </Card>
      )}

      {tab === 'portal' && <>
        <Card title="Your client portal" icon="globe">
          <p className="muted small">Clients sign in here with the email you have for them. Link it from your website or embed it.</p>
          <div className="sub row"><span className="mono small ellip grow">{portalUrl(slug)}</span><CopyButton text={portalUrl(slug)} label="Copy link" /><a className="btn" href={`/p/${slug}/login`} target="_blank" rel="noreferrer"><Icon name="eye" />Preview</a></div>
          <details><summary className="small" style={{ cursor: 'pointer' }}>Add a &quot;Client login&quot; button to your website</summary>
            <pre className="mono xs sub" style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all', marginTop: 8 }}>{`<a href="${portalUrl(slug)}" style="background:${ws.brand_color};color:#fff;padding:10px 18px;border-radius:999px;text-decoration:none;font-family:sans-serif">Client login</a>`}</pre>
          </details>
        </Card>
        <Card title="What clients see" icon="eye">
          <form action={saveSettings} className="col g12"><Hidden v={{ ws: slug, tab }} />
            <Field label="Welcome message" hint="Shown on the sign-in page and the portal home"><textarea className="inp ta" name="portal_welcome" id="st-welcome" rows={3} defaultValue={ws.portal_welcome} /></Field>
            <div className="setrow"><div className="grow"><b className="small">Show the project plan</b><p className="muted xs">Clients see tasks you mark as visible. You can still hide the plan on a single project.</p></div><Toggle name="portal_show_plan" on={ws.portal_show_plan} label="Show the project plan" /></div>
            <Save />
          </form>
        </Card>
      </>}

      {tab === 'payments' && <PaymentsTab slug={slug} canEdit={canEdit} isOwner={role === 'owner'} wsData={ws} Save={Save} />}

      {tab === 'team' && <TeamTab slug={slug} wsId={ws.id} me={user.id} role={role} plan={ws.plan as PlanKey} invite={sp.invite} />}

      {tab === 'billing' && (
        <Card title="Your plan" icon="star">
          <div className="sub row">
            <div className="grow"><b>{PLANS[ws.plan as PlanKey].name}</b><p className="muted xs">{ws.plan_status === 'trialing' ? `Free trial of every feature until ${dateY(ws.trial_ends_at)}` : ws.plan_status === 'past_due' ? 'Payment failed. Update your card to keep your plan.' : ws.plan_status === 'cancelled' ? 'Cancelled. You are on Starter limits.' : 'Active'}</p></div>
            <Chip tone={ws.plan_status === 'past_due' ? 'urgent' : ws.plan_status === 'trialing' ? 'info' : 'good'}>{ws.plan_status.replace('_', ' ')}</Chip>
          </div>
          <div className="g3">
            {(Object.keys(PLANS) as PlanKey[]).map((k) => { const p = PLANS[k]; const cur = ws.plan === k && ws.plan_status !== 'trialing'; return (
              <div key={k} className="card plan" style={{ boxShadow: cur ? 'inset 0 0 0 2px var(--ink)' : undefined }}>
                <p className="eyebrow">{p.name}</p>
                <p className="light num" style={{ fontSize: '1.6rem' }}>{p.price ? money(p.price, 'NGN') : 'Free'}<span className="muted xs">{p.price ? ' / month' : ''}</span></p>
                <p className="muted small">{p.blurb}</p>
                <ul className="small col g6" style={{ paddingLeft: 18, margin: 0 }}>
                  <li>{p.activeProjects === Infinity ? 'Unlimited' : p.activeProjects} active projects</li>
                  <li>{p.members} team member{p.members > 1 ? 's' : ''}</li>
                  <li>{p.storageGb >= 1000 ? '1 TB' : `${p.storageGb} GB`} storage</li>
                  <li>{platformFeePct(k) ? `${platformFeePct(k)}% fee on card payments` : 'No platform fee on payments'}</li>
                </ul>
                {cur ? <Chip tone="ink">Current plan</Chip> : k !== 'starter' && role === 'owner' ? <form action={startSubscription}><Hidden v={{ ws: slug, plan: k }} /><Submit className="btn primary block" pending="Opening checkout…">Choose {p.name}</Submit></form> : null}
              </div>
            ); })}
          </div>
          <p className="muted xs">Plans renew monthly through Paystack. To cancel, use the link in your Paystack receipt email or contact support.</p>
        </Card>
      )}
    </div>
  );
}

async function PaymentsTab({ slug, canEdit, isOwner, wsData: ws, Save }: { slug: string; canEdit: boolean; isOwner: boolean; wsData: Awaited<ReturnType<typeof requireMember>>['ws']; Save: (p: { label?: string }) => React.ReactElement }) {
  let banks: { name: string; code: string }[] = []; let bankErr = '';
  if (isOwner && !ws.paystack_subaccount_code) {
    try { banks = await listBanks(ws.currency === 'GHS' ? 'ghana' : ws.currency === 'KES' ? 'kenya' : ws.currency === 'ZAR' ? 'south africa' : 'nigeria'); } catch (e) { bankErr = (e as Error).message; }
  }
  return <>
    <Card title="Card payments" icon="card">
      {ws.paystack_subaccount_code ? (
        <Notice tone="good" icon="check"><div className="col g6"><b>Connected to Paystack</b><span>Card payments settle to {ws.bank_account_name} · {ws.bank_name} · {ws.bank_account_number?.replace(/\d(?=\d{4})/g, '•')}. Paystack pays out on its normal schedule.</span><span className="mono xs muted">{ws.paystack_subaccount_code}</span></div></Notice>
      ) : isOwner ? (
        <form action={connectPaystack} className="col g12"><Hidden v={{ ws: slug }} />
          <p className="muted small">Add the account where client payments should land. We check it with Paystack, then create your payout account. Clients can pay by card, bank, USSD or transfer.</p>
          {bankErr ? <Notice tone="warn" icon="alert">Couldn&apos;t load banks from Paystack: {bankErr}</Notice> : (
            <div className="fields">
              <Field label="Bank"><BankSelect banks={banks} /></Field>
              <Field label="Account number"><input className="inp mono" name="account_number" id="ps-acct" inputMode="numeric" pattern="\d{10}" maxLength={10} required placeholder="10 digits" /></Field>
            </div>
          )}
          <div className="row"><span className="sp" /><Submit pending="Checking with Paystack…" disabled={!!bankErr}>Connect payouts</Submit></div>
        </form>
      ) : <p className="muted small">The studio owner connects payouts.</p>}
    </Card>
    <Card title="Invoice defaults" icon="receipt">
      <form action={saveSettings} className="col g12"><Hidden v={{ ws: slug, tab: 'payments' }} />
        <div className="fields three">
          <Field label="Currency"><select className="sel" name="currency" id="ps-cur" defaultValue={ws.currency}>{CURRENCIES.map(([c, l]) => <option key={c} value={c}>{c} · {l}</option>)}</select></Field>
          <Field label="VAT rate (%)"><input className="inp num" type="number" step="0.01" min="0" max="100" name="vat_rate" id="ps-vat" defaultValue={ws.vat_rate} /></Field>
          <Field label="Payment terms (days)"><input className="inp num" type="number" min="0" max="120" name="payment_terms_days" id="ps-terms" defaultValue={ws.payment_terms_days} /></Field>
        </div>
        <div className="setrow"><div className="grow"><b className="small">Pass card fees to clients</b><p className="muted xs">Adds a processing fee at checkout on invoices where you turn it on.</p></div><Toggle name="pass_card_fees" on={ws.pass_card_fees} label="Pass card fees to clients" /></div>
        <Field label="Card fee (%)" hint="Paystack's local card fee is 1.5% (capped at ₦2,000)"><input className="inp num" type="number" step="0.01" min="0" max="10" name="card_fee_pct" id="ps-fee" defaultValue={ws.card_fee_pct} style={{ maxWidth: 140 }} /></Field>
        <p className="eyebrow" style={{ marginTop: 6 }}>Bank transfer details shown on invoices</p>
        <div className="fields three">
          <Field label="Bank"><input className="inp" name="bank_name" id="ps-bname" defaultValue={ws.bank_name || ''} /></Field>
          <Field label="Account name"><input className="inp" name="bank_account_name" id="ps-aname" defaultValue={ws.bank_account_name || ''} /></Field>
          <Field label="Account number"><input className="inp mono" name="bank_account_number" id="ps-anum" defaultValue={ws.bank_account_number || ''} /></Field>
        </div>
        {canEdit ? <Save /> : null}
      </form>
    </Card>
  </>;
}

async function TeamTab({ slug, wsId, me, role, plan, invite }: { slug: string; wsId: string; me: string; role: string; plan: PlanKey; invite?: string }) {
  const admin = createAdminClient();
  const [{ data: members }, { data: invites }] = await Promise.all([
    admin.from('workspace_members').select('user_id, role, created_at').eq('workspace_id', wsId).order('created_at'),
    admin.from('workspace_invites').select('id, email, role, token, created_at').eq('workspace_id', wsId).is('accepted_at', null).order('created_at', { ascending: false }),
  ]);
  // workspace_members points at auth.users, not profiles, so names are fetched separately
  const ids = (members || []).map((m) => m.user_id);
  const { data: profs } = ids.length ? await admin.from('profiles').select('id, full_name').in('id', ids) : { data: [] };
  const nameOf = Object.fromEntries((profs || []).map((p) => [p.id, p.full_name as string | null]));
  const emails = await Promise.all(ids.map(async (id) => { try { return (await admin.auth.admin.getUserById(id)).data.user?.email || ''; } catch { return ''; } }));
  const canManage = role !== 'member';
  const limit = PLANS[plan].members;
  return <>
    {invite && <Notice tone="info" icon="link"><div className="col g8"><span>Email isn&apos;t configured, so share this invite link yourself:</span><span className="mono xs" style={{ wordBreak: 'break-all' }}>{invite}</span><CopyButton text={invite} label="Copy link" /></div></Notice>}
    <Card title="Team" icon="users" extra={<span className="muted small">{(members || []).length} of {limit} seats</span>}>
      <div className="rows">
        {(members || []).map((m, i) => { const p = { full_name: nameOf[m.user_id] ?? null }; return (
          <div key={m.user_id} className="lrow">
            <Avatar name={p?.full_name || emails[i]} size="sm" />
            <div className="grow"><b>{p?.full_name || emails[i]}{m.user_id === me ? ' (you)' : ''}</b><p>{emails[i]}</p></div>
            {m.role === 'owner' || !canManage || m.user_id === me ? <Chip tone={m.role === 'owner' ? 'ink' : 'line'}>{m.role}</Chip> : <>
              <form action={teamAction} className="row"><Hidden v={{ ws: slug, op: 'role', user_id: m.user_id }} /><select className="sel" name="role" defaultValue={m.role} aria-label="Role" style={{ width: 'auto' }}><option value="member">Member</option><option value="admin">Admin</option></select><button className="btn sm">Save</button></form>
              <form action={teamAction}><Hidden v={{ ws: slug, op: 'remove', user_id: m.user_id }} /><ConfirmSubmit className="btn sm ghost" confirm="Remove?"><Icon name="trash" /></ConfirmSubmit></form>
            </>}
          </div>
        ); })}
        {(invites || []).map((v) => (
          <div key={v.id} className="lrow">
            <Avatar name={v.email} size="sm" />
            <div className="grow"><b>{v.email}</b><p>Invited {dateY(v.created_at)} · {v.role}</p></div>
            <Chip tone="warn">Pending</Chip>
            {canManage && <><CopyButton text={`${env.appUrl}/invite/${v.token}`} label="Link" /><form action={teamAction}><Hidden v={{ ws: slug, op: 'revoke', id: v.id }} /><button className="btn sm ghost">Revoke</button></form></>}
          </div>
        ))}
      </div>
    </Card>
    {canManage && (
      <Card title="Invite a teammate" icon="mail">
        <form action={inviteMember} className="col g12"><Hidden v={{ ws: slug }} />
          <div className="fields"><Field label="Email"><input className="inp" type="email" name="email" id="tm-email" required placeholder="name@studio.com" /></Field>
            <Field label="Role" hint="Admins can change settings and manage the team"><select className="sel" name="role" id="tm-role" defaultValue="member"><option value="member">Member</option><option value="admin">Admin</option></select></Field></div>
          <div className="row"><span className="sp" /><Submit pending="Inviting…"><Icon name="plus" />Send invite</Submit></div>
        </form>
      </Card>
    )}
  </>;
}
