import { NextResponse, type NextRequest } from 'next/server';
import { verifyTransaction } from '@/lib/paystack';
import { settlePayment } from '@/lib/server-helpers';
import { createAdminClient } from '@/lib/supabase/admin';
import { activateSubscription } from '@/lib/billing';

/** Paystack sends the client's browser here after checkout. The webhook does the same work; whichever is first wins. */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const ref = url.searchParams.get('reference') || url.searchParams.get('trxref');
  if (!ref) return NextResponse.redirect(new URL('/', url.origin));
  try {
    const tx = await verifyTransaction(ref);
    const meta = typeof tx.metadata === 'string' ? JSON.parse(tx.metadata || '{}') : tx.metadata || {};
    if (meta.kind === 'subscription') {
      if (tx.status === 'success') await activateSubscription(meta.workspace_id, meta.plan, tx.customer?.customer_code);
      return NextResponse.redirect(new URL(`/s/${url.searchParams.get('ws')}/settings?tab=billing&ok=${encodeURIComponent(tx.status === 'success' ? 'Plan updated. Thank you!' : 'Payment did not go through')}`, url.origin));
    }
    const { data: pay } = await createAdminClient().from('payments').select('invoice_id, workspace_id, workspaces(slug)').eq('reference', ref).maybeSingle();
    const slug = (Array.isArray(pay?.workspaces) ? pay?.workspaces[0] : pay?.workspaces as { slug: string } | undefined)?.slug;
    if (!pay || !slug) return NextResponse.redirect(new URL('/', url.origin));
    if (tx.status === 'success') {
      await settlePayment(ref, tx);
      return NextResponse.redirect(new URL(`/p/${slug}/invoices/${pay.invoice_id}?ok=${encodeURIComponent('Payment received. A receipt is on its way.')}`, url.origin));
    }
    await createAdminClient().from('payments').update({ status: 'failed' }).eq('reference', ref);
    return NextResponse.redirect(new URL(`/p/${slug}/invoices/${pay.invoice_id}?err=${encodeURIComponent('The payment did not go through. Nothing was charged. Try again or pay by transfer.')}`, url.origin));
  } catch (e) {
    console.error('[paystack callback]', e);
    return NextResponse.redirect(new URL(`/?err=${encodeURIComponent('We could not confirm the payment yet. If you were charged, it will show up shortly.')}`, url.origin));
  }
}
