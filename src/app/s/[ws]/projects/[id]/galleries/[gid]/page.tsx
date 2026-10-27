import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireMember } from '@/lib/auth';
import { Card, Chip, Crumbs, Empty, Field, Hidden, Notice, proofChip } from '@/components/ui';
import { ConfirmSubmit, CopyButton, Submit } from '@/components/client';
import { ProofUpload } from '@/components/ProofUpload';
import { Icon } from '@/components/Icon';
import { galleryAction, proofItemAction, proofReply } from '../../../../more-actions';
import { signedUrls } from '@/lib/proofs';
import { fileSize, when } from '@/lib/format';
import { portalUrl } from '@/lib/env';
import type { Contact, Gallery, GalleryItem, Project, ProofComment } from '@/lib/types';

export default async function StudioGallery({ params, searchParams }: { params: Promise<{ ws: string; id: string; gid: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { ws: slug, id, gid } = await params; const sp = await searchParams;
  const { supabase, ws } = await requireMember(slug);
  const { data } = await supabase.from('galleries').select('*, projects(*, contacts(*))').eq('id', gid).eq('workspace_id', ws.id).maybeSingle();
  if (!data) notFound();
  const g = data as Gallery & { projects: Project & { contacts: Contact } }; const p = g.projects, c = p.contacts;
  const { data: rows } = await supabase.from('gallery_items').select('*').eq('gallery_id', gid).order('position');
  const items = (rows || []) as GalleryItem[];
  const { data: com } = items.length ? await supabase.from('proof_comments').select('*').in('item_id', items.map((i) => i.id)).order('created_at') : { data: [] };
  const comments = (com || []) as ProofComment[];
  const urls = await signedUrls(items.map((i) => i.path));
  const here = `/s/${slug}/projects/${id}/galleries/${gid}`;
  const approved = items.filter((i) => i.status === 'approved').length, changes = items.filter((i) => i.status === 'changes').length;
  return (
    <div className="page">
      <Crumbs items={[['Projects', `/s/${slug}/projects`], [p.name, `/s/${slug}/projects/${id}?tab=proofing`], [g.title]]} />
      {sp.invite && <Notice tone="info" icon="link"><div className="col g8"><span>{c.name} hasn&apos;t joined the portal yet. Email isn&apos;t set up, so share this sign-in link with them:</span><span className="mono xs" style={{ wordBreak: 'break-all' }}>{sp.invite}</span><CopyButton text={sp.invite} label="Copy link" /></div></Notice>}
      <div className="phead">
        <div className="col g6"><p className="eyebrow">Proofing · {p.name}</p><h1>{g.title}</h1><p className="muted small">{items.length} image{items.length === 1 ? '' : 's'} · {approved} approved{changes ? ` · ${changes} need changes` : ''}</p></div>
        <div className="acts">
          {g.status === 'draft' ? <form action={galleryAction}><Hidden v={{ ws: slug, id: gid, op: 'share' }} /><Submit pending="Sharing…" disabled={!items.length}><Icon name="send" />Share with {c.name.split(' ')[0]}</Submit></form>
            : <>{g.status === 'approved' ? <Chip tone="good"><Icon name="check" />Approved by client</Chip> : <Chip tone="info">With {c.name.split(' ')[0]}</Chip>}
              <CopyButton text={portalUrl(slug, `/galleries/${gid}`)} label="Client link" />
              {g.status === 'shared' && <form action={galleryAction}><Hidden v={{ ws: slug, id: gid, op: 'remind' }} /><Submit className="btn" pending="Sending…"><Icon name="bell" />Remind</Submit></form>}
              <form action={galleryAction}><Hidden v={{ ws: slug, id: gid, op: 'unshare' }} /><Submit className="btn ghost" pending="…">Hide from client</Submit></form></>}
        </div>
      </div>
      <div className="split">
        <div className="stack">
          {items.length ? <div className="proofs">{items.map((it) => { const cs = comments.filter((x) => x.item_id === it.id); return (
            <article key={it.id} className="card proof">
              <a className="shot" href={urls[it.path]} target="_blank" rel="noreferrer" aria-label={`Open ${it.name} full size`}>{urls[it.path] ? <img src={urls[it.path]} alt={it.name} loading="lazy" /> : <Icon name="image" />}</a>
              <div className="row"><b className="small ellip grow">{it.name}</b>{proofChip(it.status)}</div>
              <p className="muted xs">{fileSize(it.size_bytes)}{it.decided_at ? ` · decided ${when(it.decided_at)}` : ''}</p>
              {cs.length > 0 && <div className="col g6">{cs.map((x) => <div key={x.id} className={`pc${x.from_client ? '' : ' me'}`}><b>{x.from_client ? x.author_name : `${x.author_name} (studio)`}</b> {x.body}<small>{when(x.created_at)}</small></div>)}</div>}
              <form action={proofReply} className="row"><Hidden v={{ ws: slug, item_id: it.id, return: here }} /><input className="inp" name="body" placeholder="Reply or add a note" aria-label={`Comment on ${it.name}`} /><Submit className="ibtn sm" pending="…"><Icon name="send" /></Submit></form>
              <div className="row">
                {it.status !== 'pending' && <form action={proofItemAction}><Hidden v={{ ws: slug, id: it.id, op: 'reset', return: here }} /><Submit className="btn sm ghost" pending="…"><Icon name="refresh" />Ask again</Submit></form>}
                <span className="sp" />
                <form action={proofItemAction}><Hidden v={{ ws: slug, id: it.id, op: 'delete', return: here }} /><ConfirmSubmit className="ibtn xs" confirm="Remove?"><Icon name="trash" /></ConfirmSubmit></form>
              </div>
            </article>
          ); })}</div> : <Card><Empty icon="image" title="No images yet" text="Add concepts, layouts or finals. The client sees them once you share the gallery." /></Card>}
        </div>
        <div className="stack side-sticky">
          <Card title="Add images" icon="upload"><ProofUpload galleryId={gid} /></Card>
          <Card title="Details" icon="edit">
            <form action={galleryAction} className="col g12"><Hidden v={{ ws: slug, id: gid, op: 'save' }} />
              <Field label="Title"><input className="inp" name="title" id="gd-title" defaultValue={g.title} /></Field>
              <Field label="Note for the client" optional><textarea className="inp ta" name="note" id="gd-note" rows={3} defaultValue={g.note} /></Field>
              <Submit className="btn" pending="Saving…">Save</Submit>
            </form>
          </Card>
          <form action={galleryAction}><Hidden v={{ ws: slug, id: gid, op: 'delete' }} /><ConfirmSubmit className="btn ghost block" confirm="Click again to delete the gallery and its images"><Icon name="trash" />Delete gallery</ConfirmSubmit></form>
          <Link className="link small" href={`/s/${slug}/projects/${id}?tab=proofing`}>All galleries for {p.name}</Link>
        </div>
      </div>
    </div>
  );
}
