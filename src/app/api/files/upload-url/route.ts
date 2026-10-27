import { NextResponse } from 'next/server';
import { getUser } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';

/** Issues a signed upload URL after checking the caller can see the project (member or its portal client). */
export async function POST(req: Request) {
  const { supabase, user } = await getUser();
  if (!user) return NextResponse.json({ error: 'Sign in first' }, { status: 401 });
  const { projectId, name, size } = await req.json().catch(() => ({}));
  if (!projectId || !name) return NextResponse.json({ error: 'Missing file details' }, { status: 400 });
  if (Number(size) > 2 * 1024 ** 3) return NextResponse.json({ error: 'Files can be up to 2 GB' }, { status: 413 });
  const { data: p } = await supabase.from('projects').select('id, workspace_id').eq('id', projectId).maybeSingle();
  if (!p) return NextResponse.json({ error: 'Project not found' }, { status: 404 });
  const safe = String(name).normalize('NFKD').replace(/[^\w.\- ]+/g, '').replace(/\s+/g, '-').slice(-120) || 'file';
  const path = `${p.workspace_id}/${p.id}/${crypto.randomUUID()}-${safe}`;
  const { data, error } = await createAdminClient().storage.from('files').createSignedUploadUrl(path);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ path, token: data.token });
}
