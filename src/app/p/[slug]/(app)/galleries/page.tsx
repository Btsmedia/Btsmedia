import Link from 'next/link';
import { requirePortal } from '@/lib/auth';
import { Card, Chip, Empty, PageHead } from '@/components/ui';
import { Icon } from '@/components/Icon';
import { signedUrls } from '@/lib/proofs';
import { date } from '@/lib/format';
import type { Gallery, GalleryItem, Project } from '@/lib/types';

export const metadata = { title: 'Galleries' };

export default async function PortalGalleries({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { supabase, ws } = await requirePortal(slug);
  const { data } = await supabase.from('galleries').select('*, projects(name), gallery_items(id, path, status, position)').order('shared_at', { ascending: false });
  const G = (data || []) as (Gallery & { projects: Pick<Project, 'name'>; gallery_items: Pick<GalleryItem, 'id' | 'path' | 'status' | 'position'>[] })[];
  const covers = await signedUrls(G.map((g) => [...g.gallery_items].sort((a, b) => a.position - b.position)[0]?.path).filter(Boolean) as string[]);
  return (
    <div className="page">
      <PageHead eyebrow={ws.name} title="Galleries" sub="Review work, approve it, or say what should change." />
      {G.length ? <div className="proofs">{G.map((g) => {
        const first = [...g.gallery_items].sort((a, b) => a.position - b.position)[0];
        const waiting = g.gallery_items.filter((i) => i.status === 'pending').length;
        return (
          <Link key={g.id} href={`/p/${slug}/galleries/${g.id}`} className="card proof" style={{ textDecoration: 'none' }}>
            <span className="shot">{first && covers[first.path] ? <img src={covers[first.path]} alt="" /> : <Icon name="image" />}</span>
            <div className="row"><b className="ellip grow">{g.title}</b>{g.status === 'approved' ? <Chip tone="good"><Icon name="check" />Approved</Chip> : waiting ? <Chip tone="urgent">{waiting} to review</Chip> : <Chip tone="warn">Changes asked</Chip>}</div>
            <p className="muted xs">{g.projects?.name} · {g.gallery_items.length} image{g.gallery_items.length === 1 ? '' : 's'} · shared {date(g.shared_at)}</p>
          </Link>
        );
      })}</div> : <Card><Empty icon="image" title="Nothing to review yet" text={`When ${ws.name} shares concepts or finals, they appear here.`} /></Card>}
    </div>
  );
}
