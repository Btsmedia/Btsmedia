import { NextResponse } from 'next/server';
import { getUser } from '@/lib/auth';
import { contractPdf } from '@/lib/pdf';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, user } = await getUser();
  if (!user) return NextResponse.json({ error: 'Sign in first' }, { status: 401 });
  const { data: k } = await supabase.from('contracts').select('*, contacts(*), workspaces(*)').eq('id', id).maybeSingle();
  if (!k) return NextResponse.json({ error: 'Contract not found' }, { status: 404 });
  const bytes = await contractPdf(k.workspaces, k, k.contacts);
  return new NextResponse(Buffer.from(bytes), { headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="${k.number}.pdf"` } });
}
