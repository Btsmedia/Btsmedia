import { requirePortal } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { Avatar, Card, Hidden, PageHead } from '@/components/ui';
import { ComposerKeys, LiveMessages, Submit } from '@/components/client';
import { Icon } from '@/components/Icon';
import { clientMessage } from '../../actions';
import { dateY, first, weekday, when } from '@/lib/format';
import type { Message } from '@/lib/types';

export const metadata = { title: 'Messages' };

export default async function PortalMessages({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { supabase, ws, contact } = await requirePortal(slug);
  const { data } = await supabase.from('messages').select('*').eq('contact_id', contact.id).order('created_at').limit(500);
  const thread = (data || []) as Message[];
  // Clients can't update message rows under RLS, so mark the studio's messages read with the service role,
  // scoped to the contact requirePortal just verified.
  if (thread.some((m) => !m.from_client && !m.read_by_client_at)) {
    await createAdminClient().from('messages').update({ read_by_client_at: new Date().toISOString() }).eq('contact_id', contact.id).eq('from_client', false).is('read_by_client_at', null);
  }
  let lastDay = '';
  return (
    <div className="page page-narrow">
      <PageHead eyebrow={ws.name} title="Messages" sub={`${ws.name} usually replies within a working day. You'll get an email when they do.`} />
      <Card>
        <div className="chead"><div className="who"><Avatar name={ws.name} /><div className="n"><b style={{ color: 'var(--ink)' }}>{ws.name}</b><small>{ws.email || 'Your project team'}</small></div></div></div>
        <div className="thread">
          {thread.map((m) => { const d = m.created_at.slice(0, 10); const sep = d !== lastDay; lastDay = d; return (
            <div key={m.id} style={{ display: 'contents' }}>{sep && <span className="daysep">{weekday(d)} {dateY(d)}</span>}<div className={`msg${m.from_client ? ' me' : ''}`}><p style={{ whiteSpace: 'pre-line' }}>{m.body}</p><small>{m.from_client ? 'You' : ws.name} · {when(m.created_at).split(', ')[1]}</small></div></div>
          ); })}
          {!thread.length && <p className="muted small">Ask a question, share feedback or say hello. {ws.name} sees it right away.</p>}
        </div>
        <form className="composer" action={clientMessage}><Hidden v={{ slug }} /><textarea name="body" id="pm-body" rows={3} placeholder={`Write to ${ws.name}, ${first(contact.name)}`} aria-label={`Message ${ws.name}`} /><div className="bar"><span className="muted xs">Enter sends · Shift+Enter for a new line</span><span className="sp" /><Submit className="send" pending="…"><Icon name="up" /></Submit></div></form>
        <LiveMessages contactId={contact.id} /><ComposerKeys />
      </Card>
    </div>
  );
}
