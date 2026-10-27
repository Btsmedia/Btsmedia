import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/** OAuth/PKCE style links: ?code=… */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const nextRaw = url.searchParams.get('next') || '/app';
  const next = nextRaw.startsWith('/') && !nextRaw.startsWith('//') ? nextRaw : '/app';
  if (code) {
    const sb = await createClient();
    const { error } = await sb.auth.exchangeCodeForSession(code);
    if (error) return NextResponse.redirect(new URL('/login?err=' + encodeURIComponent('That link has expired. Request a new one.'), url.origin));
  }
  return NextResponse.redirect(new URL(next, url.origin));
}
