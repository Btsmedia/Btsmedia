import type { ReactNode } from 'react';
import Link from 'next/link';
import { Icon } from './Icon';
import { avatarTone, initials, date } from '@/lib/format';
import type { ContractStatus, InvoiceStatus } from '@/lib/types';

export function Avatar({ name, size = '' }: { name?: string | null; size?: '' | 'xs' | 'sm' | 'lg' }) {
  return <span className={`av ${avatarTone(name || '?')} ${size}`} title={name || ''}>{initials(name)}</span>;
}
export function Chip({ children, tone = '' }: { children: ReactNode; tone?: '' | 'urgent' | 'ink' | 'good' | 'warn' | 'info' | 'line' }) {
  return <span className={`chip ${tone}`}>{children}</span>;
}
export function PageHead({ eyebrow, title, sub, actions }: { eyebrow?: ReactNode; title: ReactNode; sub?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="phead">
      <div className="col g6">{eyebrow && <p className="eyebrow">{eyebrow}</p>}<h1>{title}</h1>{sub && <p className="muted small">{sub}</p>}</div>
      {actions && <div className="acts">{actions}</div>}
    </div>
  );
}
export function Empty({ icon, title, text, children }: { icon: string; title: string; text?: string; children?: ReactNode }) {
  return <div className="empty"><span className="ic"><Icon name={icon} /></span><b>{title}</b>{text && <p className="small">{text}</p>}{children}</div>;
}
export function Field({ label, hint, error, children, optional }: { label: string; hint?: string; error?: string; children: ReactNode; optional?: boolean }) {
  return (
    <label className={`field${error ? ' err' : ''}`}>
      <span>{label}{optional && <span className="muted"> (optional)</span>}</span>
      {children}
      {error ? <span className="emsg">{error}</span> : hint ? <span className="hint">{hint}</span> : null}
    </label>
  );
}
export function Notice({ tone, icon, children }: { tone: 'urgent' | 'warn' | 'good' | 'info' | 'plain'; icon: string; children: ReactNode }) {
  return <div className={`notice ${tone}`}><Icon name={icon} /><div>{children}</div></div>;
}
export function Card({ title, icon, extra, children, className = '' }: { title?: ReactNode; icon?: string; extra?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`card ${className}`}>
      {(title || extra) && <div className="chead"><span className="t">{icon && <Icon name={icon} />}{title}</span>{extra}</div>}
      {children}
    </section>
  );
}
export function Crumbs({ items }: { items: [string, string?][] }) {
  return (
    <div className="crumbs">
      {items.map(([label, href], i) => href && i < items.length - 1
        ? <span key={i} className="row" style={{ gap: 6 }}><Link href={href}>{label}</Link><Icon name="right" size={12} /></span>
        : <b key={i}>{label}</b>)}
    </div>
  );
}
export function Tabs({ items, active, base }: { items: [string, string, number?][]; active: string; base: string }) {
  return (
    <div className="tabbar" role="group">
      {items.map(([k, label, n]) => (
        <Link key={k} href={`${base}${base.includes('?') ? '&' : '?'}tab=${k}`} aria-current={k === active ? 'page' : undefined} className="tablink" data-on={k === active}>
          {label}{n != null && <span className="n">{n}</span>}
        </Link>
      ))}
    </div>
  );
}
export function Steps({ stages, stage, dates }: { stages: string[]; stage: number; dates?: (string | null)[] }) {
  return (
    <div className="steps" aria-label="Project progress">
      {stages.map((s, i) => (
        <div key={i} className={`step ${i < stage ? 'done' : i === stage ? 'now' : ''}`}><i /><b>{s}</b>{dates?.[i] ? date(dates[i]) : i < stage ? 'Done' : i === stage ? 'Now' : ''}</div>
      ))}
    </div>
  );
}

export function invoiceChip(status: InvoiceStatus, overdue?: boolean, due?: string) {
  if (status === 'sent' && overdue) return <Chip tone="urgent">Overdue</Chip>;
  const m: Record<InvoiceStatus, [string, Parameters<typeof Chip>[0]['tone']]> = {
    draft: ['Draft', ''], sent: [due ? 'Due ' + date(due) : 'Due', 'warn'], processing: ['Confirming transfer', 'info'], paid: ['Paid', 'good'], void: ['Void', 'line'],
  };
  return <Chip tone={m[status][1]}>{m[status][0]}</Chip>;
}
export function contractChip(status: ContractStatus, forClient = false) {
  const m: Record<ContractStatus, [string, Parameters<typeof Chip>[0]['tone']]> = {
    draft: ['Draft', ''], sent: [forClient ? 'Signature needed' : 'Awaiting client', forClient ? 'urgent' : 'warn'], changes: ['Changes requested', 'info'], signed: ['Signed', 'good'], void: ['Void', 'line'],
  };
  return <Chip tone={m[status][1]}>{m[status][0]}</Chip>;
}
export function Toggle({ name, on, label }: { name: string; on: boolean; label: string }) {
  // Native checkbox styled as a switch; works without JavaScript inside forms
  return <label className="switch-native"><input type="checkbox" name={name} defaultChecked={on} aria-label={label} /><span className="tog" aria-hidden="true" /></label>;
}

/** Hidden inputs for server actions. */
export function Hidden({ v }: { v: Record<string, string | number | null | undefined> }) {
  return <>{Object.entries(v).map(([k, val]) => <input key={k} type="hidden" name={k} value={val == null ? '' : String(val)} />)}</>;
}

export function proofChip(st: string, forClient = false) {
  return st === 'approved' ? <Chip tone="good"><Icon name="check" />Approved</Chip> : st === 'changes' ? <Chip tone="warn">Changes asked</Chip> : <Chip tone="line">{forClient ? 'Needs your review' : 'Waiting'}</Chip>;
}
export function proposalChip(st: string, forClient = false) {
  const m: Record<string, [string, '' | 'urgent' | 'ink' | 'good' | 'warn' | 'info' | 'line']> = { draft: ['Draft', 'line'], sent: [forClient ? 'Waiting for you' : 'Sent', forClient ? 'urgent' : 'info'], accepted: ['Accepted', 'good'], declined: ['Declined', 'warn'] };
  return <Chip tone={m[st]?.[1] || 'line'}>{m[st]?.[0] || st}</Chip>;
}
