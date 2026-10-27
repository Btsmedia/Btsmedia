import { NextResponse } from 'next/server';
import { runDailyAutomations } from '@/lib/automations';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** Vercel Cron calls this once a day (see vercel.json) with Authorization: Bearer $CRON_SECRET. */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const report = await runDailyAutomations();
    return NextResponse.json({ ok: true, ...report });
  } catch (e) {
    console.error('[cron] daily automations failed', e);
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
