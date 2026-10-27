import 'server-only';
import { createClient } from '@supabase/supabase-js';
import { env } from '@/lib/env';

/**
 * Service-role client. Bypasses row level security, so only use it after the caller's
 * access has been checked with the user client, or for trusted server events (webhooks).
 */
export function createAdminClient() {
  if (!env.serviceRoleKey) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set');
  return createClient(env.supabaseUrl, env.serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
}
