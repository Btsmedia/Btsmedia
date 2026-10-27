import { NextResponse } from 'next/server';
import { getUser } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';

/** Download: row level security decides whether the caller can see the file, then we hand out a 60-second link. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, user } = await getUser();
  if (!user) return NextResponse.json({ error: 'Sign in first' }, { status: 401 });
  const { data: f } = await supabase.from('files').select('path, name').eq('id', id).maybeSingle();
  if (!f) return NextResponse.json({ error: 'File not found' }, { status: 404 });
  const { data, error } = await createAdminClient().storage.from('files').createSignedUrl(f.path, 60, { download: f.name });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.redirect(data.signedUrl);
}
