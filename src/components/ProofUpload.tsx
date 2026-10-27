'use client';
import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Icon } from './Icon';

/** Adds images to a proofing gallery: signed upload straight to storage, then a record of it. */
export function ProofUpload({ galleryId }: { galleryId: string }) {
  const input = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState<{ done: number; total: number } | null>(null);
  const [errors, setErrors] = useState<string[]>([]);

  async function upload(files: FileList | File[]) {
    const list = Array.from(files);
    const bad = list.filter((f) => !f.type.startsWith('image/'));
    const ok = list.filter((f) => f.type.startsWith('image/'));
    const errs = bad.map((f) => `${f.name}: not an image. Galleries take JPG, PNG, WebP or GIF.`);
    setBusy({ done: 0, total: ok.length });
    const sb = createClient();
    for (const f of ok) {
      try {
        const r = await fetch('/api/proofs/upload-url', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ galleryId, name: f.name, size: f.size, mime: f.type }) });
        const j = await r.json(); if (!r.ok) throw new Error(j.error || 'Upload refused');
        const { error } = await sb.storage.from('files').uploadToSignedUrl(j.path, j.token, f, { contentType: f.type });
        if (error) throw new Error(error.message);
        const d = await fetch('/api/proofs/complete', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ galleryId, path: j.path, name: f.name, size: f.size, mime: f.type }) });
        if (!d.ok) throw new Error((await d.json()).error || 'Could not save the image');
      } catch (e) { errs.push(`${f.name}: ${(e as Error).message}`); }
      setBusy((b) => (b ? { ...b, done: b.done + 1 } : b));
    }
    setErrors(errs); setBusy(null); router.refresh();
  }

  return (
    <div className="col g8">
      <div className={`drop${over ? ' over' : ''}`} role="button" tabIndex={0} aria-label="Add images to this gallery"
        onClick={() => !busy && input.current?.click()} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.current?.click(); } }}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)} onDrop={(e) => { e.preventDefault(); setOver(false); if (e.dataTransfer.files.length) upload(e.dataTransfer.files); }}>
        <span className="ic"><Icon name="image" /></span>
        <b>{busy ? `Uploading ${busy.done} of ${busy.total}…` : over ? 'Drop to add' : 'Drag images here or browse'}</b>
        <span className="muted xs">JPG, PNG, WebP or GIF · up to 50 MB each</span>
        <input ref={input} type="file" accept="image/*" multiple hidden onChange={(e) => e.target.files?.length && upload(e.target.files)} />
      </div>
      {errors.map((m, i) => <div key={i} className="notice urgent"><Icon name="alert" /><div>{m}</div></div>)}
    </div>
  );
}
