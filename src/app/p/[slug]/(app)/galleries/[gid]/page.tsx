import { notFound } from 'next/navigation';
import { requirePortal } from '@/lib/auth';
import { Card, Crumbs, Hidden, Notice, proofChip } from '@/components/ui';
import { Submit } from '@/components/client';
import { Icon } from '@/components/Icon';
import { clientApproveAll, clientProofComment, clientProofDecide } from '../../../actions';
import { signedUrls } from '@/lib/proofs';
import { when } from '@/lib/format';
import type { Gallery, GalleryItem, Project, ProofComment } from '@/lib/types';

export default async function PortalGallery({ params }: { params: Promise<{ slug: string; gid: string }> }) {
  const { slug, gid } = await params;
  const { supabase, ws } = await requirePortal(slug);
  const { data } = await supabase.from('galleries').select('*, projects(name)').eq('id', gid).maybeSingle();
  if (!data) notFound();
  const g = data as Gallery & { projects: Pick<Project, 'name'> };
  const { data: rows } = await supabase.from('gallery_items').select('*').eq('gallery_id', gid).order('position');
  const items = (rows || []) as GalleryItem[];
  const { data: com } = items.length ? await supabase.from('proof_comments').select('*').in('item_id', items.map((i) => i.id)).order('created_at') : { data: [] };
  const comments = (com || []) as ProofComment[];
  const urls = await signedUrls(items.map((i) => i.path));
  const pending = items.filter((i) => i.status !== 'approved').length;
  const h = { slug, gallery_id: gid };
  return (
    <div className="page">
      <Crumbs items={[['Galleries', `/p/${slug}/galleries`], [g.title]]} />
      <div className="phead">
        <div className="col g6"><p className="eyebrow">{g.projects?.name}</p><h1>{g.title}</h1>{g.note && <p className="muted small" style={{ maxWidth: '60ch', whiteSpace: 'pre-line' }}>{g.note}</p>}</div>
        <div className="acts">{g.status === 'approved' ? <span className="chip good"><Icon name="check" />All approved</span>
          : pending > 0 && <form action={clientApproveAll}><Hidden v={h} /><Submit pending="Approving…"><Icon name="check" />Approve all {pending}</Submit></form>}</div>
      </div>
      {g.status === 'approved' && <Notice tone="good" icon="check">You approved everything in this gallery. {ws.name} has been told.</Notice>}
      <div className="col g16">
        {items.map((it, n) => { const cs = comments.filter((x) => x.item_id === it.id); return (
          <Card key={it.id} className="proof big">
            <div className="split" style={{ alignItems: 'start' }}>
              <a className="shot" href={urls[it.path]} target="_blank" rel="noreferrer" aria-label={`Open image ${n + 1} full size`}>{urls[it.path] ? <img src={urls[it.path]} alt={`${g.title}, image ${n + 1}: ${it.name}`} loading={n > 1 ? 'lazy' : undefined} /> : <Icon name="image" />}</a>
              <div className="col g12">
                <div className="row"><b className="grow">{n + 1}. {it.name.replace(/\.[^.]+$/, '')}</b>{proofChip(it.status, true)}</div>
                {it.status !== 'approved' && <form action={clientProofDecide}><Hidden v={{ ...h, id: it.id, status: 'approved' }} /><Submit className="btn primary block" pending="…"><Icon name="check" />Approve</Submit></form>}
                <form action={clientProofDecide} className="col g8"><Hidden v={{ ...h, id: it.id, status: 'changes' }} />
                  <textarea className="inp ta" name="comment" rows={3} required placeholder="What should change? Be as specific as you like." aria-label={`Changes for image ${n + 1}`} style={{ minHeight: 76 }} />
                  <Submit className="btn block" pending="Sending…">Request changes</Submit>
                </form>
                {cs.length > 0 && <div className="col g6"><p className="eyebrow">Comments</p>{cs.map((x) => <div key={x.id} className={`pc${x.from_client ? ' me' : ''}`}><b>{x.from_client ? 'You' : x.author_name}</b> {x.body}<small>{when(x.created_at)}</small></div>)}</div>}
                <form action={clientProofComment} className="row"><Hidden v={{ ...h, id: it.id }} /><input className="inp" name="body" placeholder="Add a comment" aria-label={`Comment on image ${n + 1}`} /><Submit className="ibtn sm" pending="…"><Icon name="send" /></Submit></form>
              </div>
            </div>
          </Card>
        ); })}
      </div>
    </div>
  );
}
