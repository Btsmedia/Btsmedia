import { NextResponse } from 'next/server';
import { verifyTransaction, verifyWebhook } from '@/lib/paystack';
import { settlePayment } from '@/lib/server-helpers';
import { activateSubscription, setPlanStatus } from '@/lib/billing';

/**
 * Paystack webhook. Point Dashboard > Settings > API Keys & Webhooks at https://<APP_URL>/api/paystack/webhook
 * Every event is signature-checked, and payments are re-verified with the API before being trusted.
 */
export async function POST(req: Request) {
  const raw = await req.text();
  if (!verifyWebhook(raw, req.headers.get('x-paystack-signature'))) return NextResponse.json({ error: 'bad signature' }, { status: 401 });
  const evt = JSON.parse(raw) as { event: string; data: Record<string, any> }; // eslint-disable-line @typescript-eslint/no-explicit-any
  try {
    if (evt.event === 'charge.success') {
      const tx = await verifyTransaction(evt.data.reference);
      const meta = typeof tx.metadata === 'string' ? JSON.parse(tx.metadata || '{}') : tx.metadata || {};
      if (tx.status === 'success') {
        if (meta.kind === 'subscription') await activateSubscription(meta.workspace_id, meta.plan, tx.customer?.customer_code);
        else await settlePayment(tx.reference, tx);
      }
    }
    if (evt.event === 'subscription.create') await setPlanStatus(evt.data.customer?.customer_code, 'active', evt.data.subscription_code);
    if (evt.event === 'invoice.payment_failed') await setPlanStatus(evt.data.customer?.customer_code, 'past_due');
    if (evt.event === 'subscription.disable' || evt.event === 'subscription.not_renew') await setPlanStatus(evt.data.customer?.customer_code, 'cancelled');
  } catch (e) {
    console.error('[paystack webhook]', evt.event, e);
    return NextResponse.json({ ok: false }, { status: 500 }); // Paystack retries
  }
  return NextResponse.json({ ok: true });
}
