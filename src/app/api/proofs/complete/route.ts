import { NextResponse } from 'next/server';
import { getUser } from '@/lib/auth';

/** Records an uploaded proof image. Inserted as the user, so only studio members succeed. */
export async function POST(req: Request) {
  const { supabase, user } = await getUser();
  if (!user) return NextResponse.json({ error: 'Sign in first' }, { status: 401 });
  const { galleryId, path, name, size, mime } = await req.json().catch(() => ({}));
  const { data: g } = await supabase.from('galleries').select('id, workspace_id, project_id').eq('id', galleryId).maybeSingle();
  if (!g || typeof path !== 'string' || !path.startsWith(`${g.workspace_id}/${g.project_id}/proofs/${g.id}/`)) return NextResponse.json({ error: 'Not allowed' }, { status: 403 });
  const { count } = await supabase.from('gallery_items').select('id', { count: 'exact', head: true }).eq('gallery_id', g.id);
  const { error } = await supabase.from('gallery_items').insert({ workspace_id: g.workspace_id, gallery_id: g.id, name: String(name).slice(0, 200), path, size_bytes: Number(size) || 0, mime: mime || null, position: count || 0 });
  if (error) return NextResponse.json({ error: error.message }, { status: 403 });
  return NextResponse.json({ ok: true });
}
