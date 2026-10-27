import Link from 'next/link';
import { requirePortal } from '@/lib/auth';
import { Card, Empty, PageHead, contractChip } from '@/components/ui';
import { Icon } from '@/components/Icon';
import { date } from '@/lib/format';
import type { Contract } from '@/lib/types';

export const metadata = { title: 'Contracts' };

export default async function PortalContracts({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { supabase, ws, contact } = await requirePortal(slug);
  const { data } = await supabase.from('contracts').select('*').eq('contact_id', contact.id).neq('status', 'draft').order('created_at', { ascending: false });
  const all = (data || []) as Contract[];
  return (
    <div className="page">
      <PageHead eyebrow={ws.name} title="Contracts" sub="Read, sign and download your agreements." />
      <Card>
        {all.length ? <div className="rows">{all.map((k) => (
          <Link key={k.id} className="lrow" href={`/p/${slug}/contracts/${k.id}`}>
            <span className="ftype"><Icon name="sign" /></span>
            <div className="grow"><b>{k.title}</b><p>{k.number} · {k.client_signed_at ? `Signed ${date(k.client_signed_at)}` : `Sent ${date(k.sent_at)}`}</p></div>
            {contractChip(k.status, true)}
          </Link>
        ))}</div> : <Empty icon="sign" title="No contracts yet" text={`When ${ws.name} sends you an agreement to sign, it shows up here.`} />}
      </Card>
    </div>
  );
}
