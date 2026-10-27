import { requireUser } from '@/lib/auth';
import { acceptInvite } from '../../auth/actions';
import { Submit } from '@/components/client';
import { Notice } from '@/components/ui';
import { createAdminClient } from '@/lib/supabase/admin';

export const metadata = { title: 'Join a studio' };

export default async function Invite({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const { user } = await requireUser(`/invite/${token}`);
  const admin = createAdminClient();
  const { data: inv } = await admin.from('workspace_invites').select('email, role, accepted_at, workspaces(name)').eq('token', token).maybeSingle();
  const ws = inv ? (Array.isArray(inv.workspaces) ? inv.workspaces[0] : inv.workspaces) as { name: string } : null;
  return (
    <div className="page-narrow" style={{ paddingBlock: '8vh' }}>
      <form className="card" action={acceptInvite} style={{ padding: 28, gap: 16 }}>
        <input type="hidden" name="token" value={token} />
        {!inv || inv.accepted_at ? <><h1>Invite not found</h1><p className="muted">It may have been used already. Ask the studio owner to send a new one.</p></> : <>
          <p className="eyebrow">Team invite</p><h1>Join {ws?.name}</h1>
          <p className="muted small">You&apos;ll join as {inv.role === 'admin' ? 'an admin' : 'a team member'}.</p>
          {inv.email.toLowerCase() !== (user.email || '').toLowerCase() && <Notice tone="warn" icon="alert">This invite was sent to {inv.email}, but you&apos;re signed in as {user.email}. Sign in with the invited email to accept.</Notice>}
          <Submit className="btn primary lg block" pending="Joining…">Accept and open the studio</Submit>
        </>}
      </form>
    </div>
  );
}
