import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * Short-lived view links for images the caller has already been allowed to read
 * (the rows came back through row level security first).
 */
export async function signedUrls(paths: string[], seconds = 3600): Promise<Record<string, string>> {
  if (!paths.length) return {};
  const { data } = await createAdminClient().storage.from('files').createSignedUrls(paths, seconds);
  return Object.fromEntries((data || []).filter((d) => d.signedUrl && d.path).map((d) => [d.path as string, d.signedUrl as string]));
}
