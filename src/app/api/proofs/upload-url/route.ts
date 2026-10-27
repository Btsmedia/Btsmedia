import { NextResponse } from 'next/server';
import { getUser } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';

/** Studio members only: a signed upload URL for an image in a proofing gallery. */
export async function POST(req: Request) {
  const { supabase, user } = await getUser();
  if (!user) return NextResponse.json({ error: 'Sign in first' }, { status: 401 });
  const { galleryId, name, size, mime } = await req.json().catch(() => ({}));
  if (!galleryId || !name) return NextResponse.json({ error: 'Missing file details' }, { status: 400 });
  if (!String(mime || '').startsWith('image/')) return NextResponse.json({ error: 'Galleries take images (JPG, PNG, WebP, GIF). Share other files in the Files tab.' }, { status: 415 });
  if (Number(size) > 50 * 1024 ** 2) return NextResponse.json({ error: 'Images can be up to 50 MB' }, { status: 413 });
  const { data: g } = await supabase.from('galleries').select('id, workspace_id, project_id').eq('id', galleryId).maybeSingle();
  if (!g) return NextResponse.json({ error: 'Gallery not found' }, { status: 404 });
  const { data: m } = await supabase.from('workspace_members').select('user_id').eq('workspace_id', g.workspace_id).eq('user_id', user.id).maybeSingle();
  if (!m) return NextResponse.json({ error: 'Only the studio can add images' }, { status: 403 });
  const safe = String(name).normalize('NFKD').replace(/[^\w.\- ]+/g, '').replace(/\s+/g, '-').slice(-120) || 'image';
  const path = `${g.workspace_id}/${g.project_id}/proofs/${g.id}/${crypto.randomUUID()}-${safe}`;
  const { data, error } = await createAdminClient().storage.from('files').createSignedUploadUrl(path);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ path, token: data.token });
}
