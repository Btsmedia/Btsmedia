import { redirect } from 'next/navigation';
import { InboxView } from '../view';

export const metadata = { title: 'Inbox' };

export default async function Thread({ params, searchParams }: { params: Promise<{ ws: string; contact: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { ws, contact } = await params; const sp = await searchParams;
  // The "message someone new" picker submits to /inbox/go?to=<id>
  if (contact === 'go') redirect(sp.to ? `/s/${ws}/inbox/${sp.to}` : `/s/${ws}/inbox`);
  return <InboxView slug={ws} contactId={contact} />;
}
