import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Totals } from './types';

const ZERO: Totals = { subtotal: 0, vat_amount: 0, total: 0, paid: 0, is_overdue: false };
const norm = (r: Record<string, unknown>): Totals => ({ subtotal: Number(r.subtotal), vat_amount: Number(r.vat_amount), total: Number(r.total), paid: Number(r.paid), is_overdue: !!r.is_overdue });

/** Totals come from the invoice_totals view, which runs with the caller's permissions. */
export async function totalsFor(sb: SupabaseClient, ids: string[]): Promise<Record<string, Totals>> {
  if (!ids.length) return {};
  const { data } = await sb.from('invoice_totals').select('*').in('invoice_id', ids);
  const out: Record<string, Totals> = {};
  for (const r of data || []) out[r.invoice_id as string] = norm(r);
  return new Proxy(out, { get: (t, k: string) => t[k] ?? ZERO });
}
export async function totalOf(sb: SupabaseClient, id: string): Promise<Totals> {
  const { data } = await sb.from('invoice_totals').select('*').eq('invoice_id', id).maybeSingle();
  return data ? norm(data) : ZERO;
}
