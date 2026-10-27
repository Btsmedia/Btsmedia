'use client';
import { useEffect, useState, type ReactNode } from 'react';
import { useFormStatus } from 'react-dom';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Icon } from './Icon';

export function Submit({ children, className = 'btn primary', pending = 'Working…', disabled, name, value, formAction }: { children: ReactNode; className?: string; pending?: string; disabled?: boolean; name?: string; value?: string; formAction?: (fd: FormData) => void }) {
  const s = useFormStatus();
  return <button type="submit" className={className} disabled={disabled || s.pending} name={name} value={value} formAction={formAction} aria-busy={s.pending}>{s.pending ? pending : children}</button>;
}

/** Two-step confirm for destructive actions, built into the page (no browser dialogs). */
export function ConfirmSubmit({ children, confirm = 'Click again to confirm', className = 'btn danger' }: { children: ReactNode; confirm?: string; className?: string }) {
  const [armed, setArmed] = useState(false);
  const s = useFormStatus();
  useEffect(() => { if (!armed) return; const t = setTimeout(() => setArmed(false), 4000); return () => clearTimeout(t); }, [armed]);
  return armed
    ? <button type="submit" className={className} disabled={s.pending}>{s.pending ? 'Working…' : confirm}</button>
    : <button type="button" className={className} onClick={() => setArmed(true)}>{children}</button>;
}

/** Shows ?ok= and ?err= messages left by server actions, then cleans the URL. */
export function Toast() {
  const sp = useSearchParams(); const router = useRouter(); const path = usePathname();
  const ok = sp.get('ok'), err = sp.get('err');
  const [msg, setMsg] = useState<{ t: string; bad: boolean } | null>(null);
  useEffect(() => {
    if (!ok && !err) return;
    setMsg({ t: (ok || err)!, bad: !!err });
    const q = new URLSearchParams(sp.toString()); q.delete('ok'); q.delete('err');
    router.replace(path + (q.toString() ? '?' + q : ''), { scroll: false });
    const t = setTimeout(() => setMsg(null), 4200); return () => clearTimeout(t);
  }, [ok, err]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!msg) return null;
  return <div className="toast" role="status" style={msg.bad ? { background: 'var(--urgent)', color: '#fff' } : undefined}>{msg.t}</div>;
}

export function NavRail({ items, base, footer }: { items: ({ href: string; icon: string; label: string; badge?: number } | '|')[]; base: string; footer?: ReactNode }) {
  const path = usePathname();
  const active = (href: string) => href === base ? path === base : path === href || path.startsWith(href + '/');
  return (
    <aside className="rail">
      <Link className="logo" href={base} aria-label="Home"><span><b>O</b></span></Link>
      <nav className="nav">
        {items.map((it, i) => it === '|' ? <span key={i} className="sep" aria-hidden="true" /> : (
          <Link key={it.href} href={it.href} className="ibtn" aria-current={active(it.href) ? 'page' : undefined} aria-label={it.label + (it.badge ? `, ${it.badge} new` : '')}>
            <Icon name={it.icon} />{it.badge ? <span className="cnt">{it.badge}</span> : null}<span className="tip">{it.label}</span>
          </Link>
        ))}
      </nav>
      <div className="me">{footer}</div>
    </aside>
  );
}

export function CopyButton({ text, label = 'Copy' }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return <button type="button" className="btn" onClick={() => { navigator.clipboard?.writeText(text).then(() => { setDone(true); setTimeout(() => setDone(false), 1600); }).catch(() => {}); }}><Icon name="copy" />{done ? 'Copied' : label}</button>;
}

/** Refreshes the page when a new message arrives for this conversation. */
export function LiveMessages({ contactId }: { contactId: string }) {
  const router = useRouter();
  useEffect(() => {
    let cleanup = () => {};
    import('@/lib/supabase/client').then(({ createClient }) => {
      const sb = createClient();
      const ch = sb.channel('msgs-' + contactId).on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `contact_id=eq.${contactId}` }, () => router.refresh()).subscribe();
      cleanup = () => { sb.removeChannel(ch); };
    });
    const el = document.querySelector('.thread'); if (el) el.scrollTop = el.scrollHeight;
    return () => cleanup();
  }, [contactId, router]);
  return null;
}

/** Enter submits the message composer; Shift+Enter adds a new line. */
export function ComposerKeys() {
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (e.key === 'Enter' && !e.shiftKey && t.tagName === 'TEXTAREA' && t.closest('.composer')) { e.preventDefault(); (t.closest('form') as HTMLFormElement)?.requestSubmit(); }
    };
    document.addEventListener('keydown', h); return () => document.removeEventListener('keydown', h);
  }, []);
  return null;
}
