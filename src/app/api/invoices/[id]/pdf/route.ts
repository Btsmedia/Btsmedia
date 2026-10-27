import { NextResponse } from 'next/server';
import { getUser } from '@/lib/auth';
import { totalOf } from '@/lib/data';
import { invoicePdf } from '@/lib/pdf';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, user } = await getUser();
  if (!user) return NextResponse.json({ error: 'Sign in first' }, { status: 401 });
  const { data: inv } = await supabase.from('invoices').select('*, contacts(*), projects(*), workspaces(*), invoice_items(*)').eq('id', id).maybeSingle();
  if (!inv) return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
  const items = [...inv.invoice_items].sort((a, b) => a.position - b.position);
  const bytes = await invoicePdf(inv.workspaces, inv, items, await totalOf(supabase, id), inv.contacts, inv.projects);
  return new NextResponse(Buffer.from(bytes), { headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="${inv.number}.pdf"` } });
}
