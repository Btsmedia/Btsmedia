import Link from 'next/link';
import { Icon } from '@/components/Icon';
import { PLANS } from '@/lib/plans';
import { money } from '@/lib/format';
import { getUser } from '@/lib/auth';

const FEATURES = [
  ['users', 'Leads and CRM', 'Every enquiry on a board. Convert a lead into a project with its contract and deposit invoice in one step.'],
  ['folder', 'Projects', 'Stages, task lists, notes and files. Choose exactly what each client can see.'],
  ['receipt', 'Invoices that get paid', 'Card and bank transfer through Paystack, straight to your bank. VAT, schedules and receipts handled.'],
  ['sign', 'Contracts and e-signatures', 'Templates with variables, a signature in the portal, a sealed record of who signed and when.'],
  ['globe', 'Your branded portal', 'Clients sign in to pay, sign, upload and message you. One inbox for every thread.'],
  ['quote', 'Proposals that close', 'Packages, deposit and terms in one page. One click to accept creates the project, agreement and deposit invoice.'],
  ['image', 'Proofing galleries', 'Share concepts and finals. Clients approve each image or say exactly what to change.'],
  ['cal', 'Booking page', 'Discovery calls on your hours, in your time zone. Every booking lands as a lead.'],
  ['bolt', 'Automations', 'Invoice reminders, contract nudges and meeting reminders that run themselves.'],
] as const;

export default async function Landing() {
  const { user } = await getUser();
  return (
    <div className="marketing">
      <header className="row">
        <span className="logo"><span><b>O</b></span></span><b style={{ fontSize: '1.15rem', letterSpacing: '-.02em' }}>Onera</b>
        <span className="sp" />
        {user ? <Link className="btn primary" href="/app">Open your studio</Link> : <><Link className="btn" href="/login">Sign in</Link><Link className="btn primary" href="/signup">Start free</Link></>}
      </header>
      <section className="hero col g20">
        <p className="eyebrow">For design studios, agencies and freelancers</p>
        <h1>Run every client from one place.</h1>
        <p>Proposals, contracts, invoices, proofing, booking and a client portal with your name on it. Built for studios that bill in naira, cedis and shillings.</p>
        <div className="row wrap"><Link className="btn primary lg" href="/signup">Create your studio</Link><span className="muted small">14 days of Studio features free. No card needed.</span></div>
        <div className="hero-art" aria-hidden="true"><span className="b1" /><span className="b2" /><span className="b3" /><span className="slab" /></div>
      </section>
      <section className="g3">
        {FEATURES.map(([icon, t, d]) => (
          <div key={t} className="card"><span className="ftype" style={{ background: 'var(--tint)' }}><Icon name={icon} /></span><h2>{t}</h2><p className="muted small">{d}</p></div>
        ))}
      </section>
      <section className="col g16">
        <h2 style={{ fontSize: '1.6rem' }}>Plans</h2>
        <div className="g3">
          {Object.entries(PLANS).map(([k, p]) => (
            <div key={k} className={`card plan${k === 'studio' ? ' on' : ''}`}>
              <p className="eyebrow">{p.blurb}</p><h2>{p.name}</h2>
              <p className="price num">{p.price ? money(p.price) : 'Free'}<span className="muted small">{p.price ? ' / month' : ''}</span></p>
              <div className="col g6 small ink2">
                <p>{p.activeProjects === Infinity ? 'Unlimited' : p.activeProjects} active projects</p>
                <p>{p.members} team member{p.members > 1 ? 's' : ''}</p>
                <p>{p.storageGb >= 1000 ? '1 TB' : p.storageGb + ' GB'} file storage</p>
                <p>{p.defaultFee ? `${p.defaultFee}% on card payments` : 'No fee on payments'}</p>
              </div>
              <Link className={`btn${k === 'studio' ? ' primary' : ''}`} href="/signup">Start with {p.name}</Link>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
