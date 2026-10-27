'use client';
import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Icon } from './Icon';

const MAX = 2 * 1024 ** 3;
const size = (b: number) => (b > 1e9 ? (b / 1e9).toFixed(1) + ' GB' : b > 1e6 ? (b / 1e6).toFixed(1) + ' MB' : Math.max(1, Math.round(b / 1e3)) + ' KB');

/**
 * Uploads straight to Supabase Storage with a signed URL the server issues after checking access,
 * then records the file. Works for studio members and portal clients.
 */
export function FileUpload({ projectId, studio }: { projectId: string; studio?: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const [over, setOver] = useState(false);
  const [shared, setShared] = useState(true);
  const [items, setItems] = useState<{ name: string; size: number; state: 'up' | 'done' | 'err'; msg?: string }[]>([]);
  const [error, setError] = useState('');

  async function upload(files: FileList | File[]) {
    setError('');
    const list = Array.from(files);
    const big = list.find((f) => f.size > MAX);
    if (big) { setError(`“${big.name}” is ${size(big.size)}. The limit is 2 GB per file. Compress it or share a link in Messages.`); return; }
    setItems(list.map((f) => ({ name: f.name, size: f.size, state: 'up' })));
    const sb = createClient();
    for (const [i, f] of list.entries()) {
      try {
        const r = await fetch('/api/files/upload-url', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ projectId, name: f.name, size: f.size }) });
        const j = await r.json(); if (!r.ok) throw new Error(j.error || 'Upload refused');
        const { error: upErr } = await sb.storage.from('files').uploadToSignedUrl(j.path, j.token, f, { contentType: f.type || 'application/octet-stream' });
        if (upErr) throw new Error(upErr.message);
        const done = await fetch('/api/files/complete', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ projectId, path: j.path, name: f.name, size: f.size, mime: f.type, shared: studio ? shared : true }) });
        if (!done.ok) throw new Error((await done.json()).error || 'Could not save the file');
        setItems((x) => x.map((it, k) => (k === i ? { ...it, state: 'done' } : it)));
      } catch (e) {
        setItems((x) => x.map((it, k) => (k === i ? { ...it, state: 'err', msg: (e as Error).message } : it)));
      }
    }
    router.refresh();
  }

  return (
    <div className="col g8">
      {error && <div className="notice urgent"><Icon name="alert" /><div>{error}</div></div>}
      <div className={`drop${over ? ' over' : ''}`} role="button" tabIndex={0} aria-label="Choose files to upload"
        onClick={() => input.current?.click()} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.current?.click(); } }}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)} onDrop={(e) => { e.preventDefault(); setOver(false); if (e.dataTransfer.files.length) upload(e.dataTransfer.files); }}>
        <span className="ic"><Icon name="upload" /></span><b>{over ? 'Drop to upload' : 'Drag files here or browse'}</b><span className="muted xs">Up to 2 GB per file</span>
        <input ref={input} type="file" multiple hidden onChange={(e) => e.target.files?.length && upload(e.target.files)} />
      </div>
      {studio && <label className="check"><input type="checkbox" checked={shared} onChange={(e) => setShared(e.target.checked)} /> Visible to the client</label>}
      {items.map((it, i) => (
        <div key={i} className="upitem"><span className="ftype">{it.name.split('.').pop()?.toUpperCase().slice(0, 4)}</span><div className="grow"><b className="small ellip" style={{ display: 'block', fontWeight: 500 }}>{it.name}</b><span className={`xs ${it.state === 'err' ? '' : 'muted'}`} style={it.state === 'err' ? { color: 'var(--urgent)' } : undefined}>{it.state === 'up' ? 'Uploading…' : it.state === 'done' ? size(it.size) + ' · uploaded' : it.msg}</span></div>{it.state === 'done' && <span className="chip good"><Icon name="check" />Done</span>}</div>
      ))}
    </div>
  );
}
