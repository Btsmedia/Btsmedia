import Link from 'next/link';
import { requirePortal } from '@/lib/auth';
import { Card, Chip, Empty, Hidden, Steps } from '@/components/ui';
import { Submit } from '@/components/client';
import { Icon } from '@/components/Icon';
import { clientMessage } from '../actions';
import { totalsFor } from '@/lib/data';
import { date, dateY, first, money, relDue, when, weekday } from '@/lib/format';
import type { Contract, FileRow, Invoice, Message, Project } from '@/lib/types';

export const metadata = { title: 'Overview' };

export default async function PortalHome({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { supabase, ws, contact } = await requirePortal(slug);
  const b = `/p/${slug}`;
  const [{ data: projects }, { data: invoices }, { data: contracts }, { data: files }, { data: lastMsg }] = await Promise.all([
    supabase.from('projects').select('*').eq('contact_id', contact.id).order('created_at', { ascending: false }),
    supabase.from('invoices').select('*').eq('contact_id', contact.id).neq('status', 'draft').order('due_on'),
    supabase.from('contracts').select('*').eq('contact_id', contact.id).neq('status', 'draft').order('created_at', { ascending: false }),
    supabase.from('files').select('*').eq('shared', true).order('created_at', { ascending: false }).limit(3),
    supabase.from('messages').select('*').eq('contact_id', contact.id).eq('from_client', false).order('created_at', { ascending: false }).limit(1),
  ]);
  const P = (projects || []) as Project[], I = (invoices || []) as Invoice[], K = (contracts || []) as Contract[];
  const tot = await totalsFor(supabase, I.map((i) => i.id));
  const toPay = I.filter((i) => i.status === 'sent'), toSign = K.filter((k) => k.status === 'sent');
  const active = P.filter((p) => p.status === 'active');
  const cur = active[0] || P[0];
  const projIds = P.map((p) => p.id);
  const paidOnCur = cur ? I.filter((i) => i.project_id === cur.id).reduce((s, i) => s + tot[i.id].paid, 0) : 0;
  const msg = (lastMsg || [])[0] as Message | undefined;
  const [{ data: props }, { data: gals }] = await Promise.all([
    supabase.from('proposals').select('id, title, number, sent_at').eq('contact_id', contact.id).eq('status', 'sent'),
    supabase.from('galleries').select('id, title, shared_at, gallery_items(status)').eq('status', 'shared'),
  ]);
  const toReview = ((gals || []) as { id: string; title: string; shared_at: string | null; gallery_items: { status: string }[] }[]).filter((g) => g.gallery_items.some((i) => i.status === 'pending'));

  return (
    <div className="page">
      <div className="phead"><div className="col g6"><p className="eyebrow">{weekday(new Date().toISOString())} {dateY(new Date().toISOString())}</p><h1>Hi {first(contact.name)}</h1><p className="muted small">{ws.portal_welcome}</p></div></div>
      <div className="cols3">
        <div className="stack">
          {(props || []).map((q) => (
            <article key={q.id} className="card mini"><div className="chead"><span className="t"><Icon name="quote" />Proposal</span><Chip tone="urgent">Waiting for you</Chip></div><p className="title">{q.title}</p><p className="desc">Review what&apos;s included and accept to get started.</p><div className="cfoot"><span className="muted xs">Sent {date(q.sent_at)}</span><Link className="btn primary" href={`${b}/proposals/${q.id}`}>Review proposal</Link></div></article>
          ))}
          {toReview.map((g) => (
            <article key={g.id} className="card mini"><div className="chead"><span className="t"><Icon name="image" />Gallery</span><Chip tone="warn">{g.gallery_items.filter((i) => i.status === 'pending').length} to review</Chip></div><p className="title">{g.title}</p><p className="desc">Approve each image or say what should change.</p><div className="cfoot"><span className="muted xs">Shared {date(g.shared_at)}</span><Link className="btn primary" href={`${b}/galleries/${g.id}`}>Review</Link></div></article>
          ))}
          {toSign.map((k) => (
            <article key={k.id} className="card mini"><div className="chead"><span className="t"><Icon name="sign" />Agreement</span><Chip tone="urgent">Signature needed</Chip></div><p className="title">{k.title}</p><p className="desc">{ws.name} has signed. Your signature completes it.</p><div className="cfoot"><span className="muted xs">Sent {date(k.sent_at)}</span><Link className="btn primary" href={`${b}/contracts/${k.id}`}>Review and sign</Link></div></article>
          ))}
          {toPay.map((i) => (
            <article key={i.id} className="card mini"><div className="chead"><span className="t"><Icon name="receipt" />{i.number}</span>{tot[i.id].is_overdue ? <Chip tone="urgent">Overdue</Chip> : <Chip tone="warn">Due {date(i.due_on)}</Chip>}</div><p className="title">{i.title}</p>
              <div className="feature"><div><p className="eyebrow">Amount due</p><p className="amt">{money(tot[i.id].total - tot[i.id].paid, ws.currency)}</p><p className="muted small">{relDue(i.due_on)}</p></div><Link className="badge-btn" href={`${b}/invoices/${i.id}`}>Pay now<span><Icon name="arrow" /></span></Link></div></article>
          ))}
          {!toSign.length && !toPay.length && !(props || []).length && !toReview.length && <Card><Empty icon="check" title="You're all caught up" text={`Nothing needs you right now. ${ws.name} will email you when something does.`} /></Card>}
        </div>
        <section className="card center">
          {cur ? <>
            <div className="meta"><Icon name="doc" size={16} /><span>{cur.code}</span><span className="sp" style={{ flex: 1 }} />{cur.due_date && <span className="muted">Handoff {dateY(cur.due_date)}</span>}<Link className="ibtn sm" href={`${b}/projects/${cur.id}`} aria-label="Open project"><Icon name="arrow" /></Link></div>
            <div className="hero"><div className="bigav" style={{ background: `linear-gradient(140deg, ${ws.brand_color}99, ${ws.brand_color})` }}>{cur.name[0]}</div><p className="n">{cur.name}</p><p className="muted small">{cur.status === 'completed' ? 'Completed' : `Now: ${cur.stages[cur.stage]}`}</p></div>
            <Steps stages={cur.stages} stage={cur.status === 'completed' ? cur.stages.length : cur.stage} />
            {cur.summary && <p className="body">{cur.summary}</p>}
            {msg && <div className="sub"><p className="muted xs">Latest from {ws.name} · {when(msg.created_at)}</p><p style={{ marginTop: 6, whiteSpace: 'pre-line', color: 'var(--ink-2)' }}>{msg.body}</p></div>}
            <form className="composer" action={clientMessage}><Hidden v={{ slug, return: b }} /><input name="body" id="pq-body" placeholder={`Write to ${ws.name}`} aria-label={`Message ${ws.name}`} /><div className="bar"><Link className="ibtn sm" href={`${b}/files`} aria-label="Upload files"><Icon name="clip" /></Link><span className="sp" /><Submit className="send" pending="…"><Icon name="up" /></Submit></div></form>
          </> : <Empty icon="folder" title="No projects yet" text={`${ws.name} will add your project here.`} />}
        </section>
        <div className="stack">
          {cur && (
            <Card title="Payments" icon="receipt" extra={<span className="muted small num">{money(cur.value, ws.currency)}</span>}>
              <div className="sub col g8"><p className="muted small">Paid so far</p><p className="light num" style={{ fontSize: '1.6rem' }}>{money(paidOnCur, ws.currency)}</p><div className="prog"><i style={{ width: `${Number(cur.value) ? Math.min(100, (paidOnCur / Number(cur.value)) * 100) : 0}%` }} /></div></div>
              <Link className="link" href={`${b}/invoices`}>View all invoices</Link>
            </Card>
          )}
          {P.length > 1 && <Card title="Your projects" icon="folder"><div className="rows">{P.map((p) => <Link key={p.id} className="lrow" href={`${b}/projects/${p.id}`}><div className="grow"><b>{p.name}</b><p>{p.status === 'completed' ? 'Completed' : p.stages[p.stage]}</p></div></Link>)}</div></Card>}
          <Card title="Recent files" icon="folder" extra={<Link className="link" href={`${b}/files`}>All files</Link>}>
            {((files || []) as FileRow[]).filter((f) => projIds.includes(f.project_id)).length ? <div className="rows">{((files || []) as FileRow[]).filter((f) => projIds.includes(f.project_id)).map((f) => <a key={f.id} className="lrow" href={`/api/files/${f.id}`}><span className="ftype">{f.name.split('.').pop()?.toUpperCase().slice(0, 4)}</span><div className="grow"><b className="ellip">{f.name}</b><p>{date(f.created_at)}</p></div><Icon name="download" size={15} /></a>)}</div> : <p className="muted small">Nothing shared yet.</p>}
          </Card>
        </div>
      </div>
    </div>
  );
}
