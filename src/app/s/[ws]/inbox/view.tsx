import Link from 'next/link';
import { requireMember } from '@/lib/auth';
import { Avatar, Chip, Empty, Hidden, PageHead } from '@/components/ui';
import { ComposerKeys, LiveMessages, Submit } from '@/components/client';
import { Icon } from '@/components/Icon';
import { sendMessage } from '../actions';
import { date, dateY, weekday, when } from '@/lib/format';
import type { Contact, Message } from '@/lib/types';

/** Two-pane inbox: one thread per client, portal and email messages together. */
export async function InboxView({ slug, contactId }: { slug: string; contactId: string | null }) {
  const { supabase, ws } = await requireMember(slug);
  const { data: recent } = await supabase.from('messages').select('contact_id, body, from_client, created_at, read_by_studio_at, contacts(id, name, company)').eq('workspace_id', ws.id).order('created_at', { ascending: false }).limit(400);
  const convs: { c: Contact; last: Message; unread: number }[] = [];
  const idx: Record<string, number> = {};
  for (const m of recent || []) {
    const c = (Array.isArray(m.contacts) ? m.contacts[0] : m.contacts) as Contact;
    if (idx[m.contact_id] === undefined) { idx[m.contact_id] = convs.length; convs.push({ c, last: m as unknown as Message, unread: 0 }); }
    if (m.from_client && !m.read_by_studio_at) convs[idx[m.contact_id]].unread++;
  }
  let thread: Message[] = []; let contact: Contact | null = null;
  if (contactId) {
    const [{ data: c }, { data: msgs }] = await Promise.all([
      supabase.from('contacts').select('*').eq('id', contactId).eq('workspace_id', ws.id).maybeSingle(),
      supabase.from('messages').select('*').eq('contact_id', contactId).order('created_at'),
    ]);
    contact = c as Contact | null; thread = (msgs || []) as Message[];
    if (contact) {
      await supabase.from('messages').update({ read_by_studio_at: new Date().toISOString() }).eq('contact_id', contactId).eq('from_client', true).is('read_by_studio_at', null);
      if (idx[contactId] === undefined) convs.unshift({ c: contact, last: { body: 'New conversation', created_at: new Date().toISOString(), from_client: false } as Message, unread: 0 });
      else convs[idx[contactId]].unread = 0;
    }
  }
  const { data: all } = await supabase.from('contacts').select('id, name, company').eq('workspace_id', ws.id).order('name').limit(200);
  let lastDay = '';
  return (
    <div className="page">
      <PageHead eyebrow="Portal and email messages in one place" title="Inbox" />
      <div className="inbox">
        <section className="card" style={{ padding: 12 }}>
          <form action={`/s/${slug}/inbox/go`} className="row" style={{ padding: '4px 4px 8px' }}>
            <select className="sel" name="to" id="ib-new" defaultValue="" style={{ fontSize: '.8rem' }}><option value="" disabled>Message someone new…</option>{(all || []).map((c) => <option key={c.id} value={c.id}>{c.name}{c.company ? ` · ${c.company}` : ''}</option>)}</select>
            <button className="btn">Go</button>
          </form>
          <div className="col" style={{ gap: 2 }}>
            {convs.map(({ c, last, unread }) => (
              <Link key={c.id} className="conv" href={`/s/${slug}/inbox/${c.id}`} aria-current={c.id === contactId ? 'true' : undefined}>
                <Avatar name={c.name} size="sm" /><div className="grow"><div className="row"><b className="small ellip">{c.name}</b><span className="sp" /><span className="muted xs">{date(last.created_at)}</span></div><p className="ellip">{last.from_client ? '' : 'You: '}{last.body}</p></div>{unread ? <span className="unread" aria-label={`${unread} unread`} /> : null}
              </Link>
            ))}
            {!convs.length && <p className="muted small" style={{ padding: 10 }}>No messages yet. Clients can message you from their portal.</p>}
          </div>
        </section>
        <section className="card">
          {contact ? <>
            <div className="chead"><div className="who"><Avatar name={contact.name} /><div className="n"><b style={{ color: 'var(--ink)' }}>{contact.name}</b><small>{[contact.company, contact.email].filter(Boolean).join(' · ')}</small></div></div><span className="sp" />{contact.portal_status === 'active' ? <Chip tone="good">In portal</Chip> : <Chip tone="line">Email only</Chip>}<Link className="btn" href={`/s/${slug}/contacts/${contact.id}`}>Contact</Link></div>
            <div className="thread">
              {thread.map((m) => { const d = m.created_at.slice(0, 10); const sep = d !== lastDay; lastDay = d; return (
                <div key={m.id} style={{ display: 'contents' }}>{sep && <span className="daysep">{weekday(d)} {dateY(d)}</span>}<div className={`msg${m.from_client ? '' : ' me'}`}><p style={{ whiteSpace: 'pre-line' }}>{m.body}</p><small>{when(m.created_at).split(', ')[1]}</small></div></div>
              ); })}
              {!thread.length && <p className="muted small">Start the conversation. {contact.portal_status === 'active' ? `${contact.name.split(' ')[0]} sees it in their portal and by email.` : 'They get it by email with a link to their portal.'}</p>}
            </div>
            <form className="composer" action={sendMessage}><Hidden v={{ ws: slug, contact_id: contact.id }} /><textarea name="body" id="ib-body" rows={3} placeholder={`Reply to ${contact.name.split(' ')[0]}`} /><div className="bar"><span className="muted xs">Enter sends · Shift+Enter for a new line</span><span className="sp" /><Submit className="send" pending="…"><Icon name="up" /></Submit></div></form>
            <LiveMessages contactId={contact.id} /><ComposerKeys />
          </> : <Empty icon="chat" title="No conversation selected" text="Pick a client on the left or start a new message." />}
        </section>
      </div>
    </div>
  );
}
