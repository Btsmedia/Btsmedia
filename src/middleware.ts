import { NextResponse, type NextRequest } from 'next/server';
import { env } from '@/lib/env';
import { createServerClient } from '@supabase/ssr';

const RESERVED = new Set(['www', 'app', 'api', 'admin', 'mail']);

/**
 * 1. Client portals on <slug>.PORTAL_ROOT_DOMAIN are rewritten to /p/<slug>/...
 * 2. The Supabase session cookie is refreshed on every request.
 */
export async function middleware(req: NextRequest) {
  const host = (req.headers.get('host') || '').split(':')[0].toLowerCase();
  const root = (process.env.PORTAL_ROOT_DOMAIN || '').toLowerCase();
  const path = req.nextUrl.pathname;
  let rewriteTo: URL | null = null;
  if (root && host.endsWith('.' + root)) {
    const slug = host.slice(0, -(root.length + 1));
    const passthrough = path.startsWith('/p/') || path.startsWith('/b/') || path.startsWith('/api/') || path.startsWith('/auth/');
    if (slug && !slug.includes('.') && !RESERVED.has(slug) && !passthrough) {
      rewriteTo = req.nextUrl.clone();
      rewriteTo.pathname = `/p/${slug}${path === '/' ? '' : path}`;
    }
  }

  let res = rewriteTo ? NextResponse.rewrite(rewriteTo, { request: req }) : NextResponse.next({ request: req });
  const url = env.supabaseUrl, key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return res;

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => req.cookies.getAll(),
      setAll: (list) => {
        list.forEach(({ name, value }) => req.cookies.set(name, value));
        res = rewriteTo ? NextResponse.rewrite(rewriteTo, { request: req }) : NextResponse.next({ request: req });
        list.forEach(({ name, value, options }) => res.cookies.set(name, value, options));
      },
    },
  });
  await supabase.auth.getUser();
  return res;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)'],
};
