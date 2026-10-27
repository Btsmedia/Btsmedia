import { redirect } from 'next/navigation';
import { requireMember } from '@/lib/auth';
import { InboxView } from './view';

export const metadata = { title: 'Inbox' };

export default async function Inbox({ params }: { params: Promise<{ ws: string }> }) {
  const { ws: slug } = await params;
  const { supabase, ws } = await requireMember(slug);
  const { data } = await supabase.from('messages').select('contact_id').eq('workspace_id', ws.id).order('created_at', { ascending: false }).limit(1);
  if (data?.[0]) redirect(`/s/${slug}/inbox/${data[0].contact_id}`);
  return <InboxView slug={slug} contactId={null} />;
}
