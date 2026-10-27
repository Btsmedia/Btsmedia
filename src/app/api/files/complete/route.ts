import { NextResponse } from 'next/server';
import { getUser } from '@/lib/auth';

/** Records an uploaded file. Inserted as the user, so row level security decides who may add files. */
export async function POST(req: Request) {
  const { supabase, user } = await getUser();
  if (!user) return NextResponse.json({ error: 'Sign in first' }, { status: 401 });
  const { projectId, path, name, size, mime, shared } = await req.json().catch(() => ({}));
  const { data: p } = await supabase.from('projects').select('id, workspace_id, contact_id').eq('id', projectId).maybeSingle();
  if (!p || typeof path !== 'string' || !path.startsWith(`${p.workspace_id}/${p.id}/`)) return NextResponse.json({ error: 'Not allowed' }, { status: 403 });
  const { data: member } = await supabase.from('workspace_members').select('user_id').eq('workspace_id', p.workspace_id).eq('user_id', user.id).maybeSingle();
  const byClient = !member;
  const { error } = await supabase.from('files').insert({ workspace_id: p.workspace_id, project_id: p.id, name: String(name).slice(0, 200), path, size_bytes: Number(size) || 0, mime: mime || null, uploaded_by: user.id, by_client: byClient, shared: byClient ? true : !!shared });
  if (error) return NextResponse.json({ error: error.message }, { status: 403 });
  if (byClient) {
    const { data: c } = await supabase.from('contacts').select('name').eq('id', p.contact_id).maybeSingle();
    // Clients can't write activity directly; this is informational only, so use the admin client.
    const { createAdminClient } = await import('@/lib/supabase/admin');
    await createAdminClient().from('activity').insert({ workspace_id: p.workspace_id, actor_id: user.id, actor_name: c?.name || 'Client', from_client: true, kind: 'file.uploaded', entity_type: 'project', entity_id: p.id, message: `uploaded ${name}` });
  }
  return NextResponse.json({ ok: true });
}
