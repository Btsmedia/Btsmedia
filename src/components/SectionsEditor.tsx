'use client';
import { useRef, useState } from 'react';
import { Icon } from './Icon';
import type { Section } from '@/lib/types';

/** Edits contract sections; the JSON lands in a hidden input named `name` for the server action. */
export function SectionsEditor({ initial, name, vars }: { initial: Section[]; name: string; vars?: string[] }) {
  const [rows, setRows] = useState<Section[]>(initial.length ? initial : [{ heading: 'Scope', body: '' }]);
  const last = useRef<{ i: number; el: HTMLTextAreaElement } | null>(null);
  const set = (i: number, p: Partial<Section>) => setRows((r) => r.map((x, k) => (k === i ? { ...x, ...p } : x)));
  const insert = (v: string) => {
    const t = last.current; if (!t) return;
    const s = t.el.selectionStart ?? t.el.value.length, e = t.el.selectionEnd ?? s;
    const next = t.el.value.slice(0, s) + v + t.el.value.slice(e);
    set(t.i, { body: next });
    requestAnimationFrame(() => { t.el.focus(); t.el.selectionStart = t.el.selectionEnd = s + v.length; });
  };
  const move = (i: number, d: number) => setRows((r) => { const j = i + d; if (j < 0 || j >= r.length) return r; const c = [...r]; [c[i], c[j]] = [c[j], c[i]]; return c; });
  return (
    <div className="col g8">
      <input type="hidden" name={name} value={JSON.stringify(rows)} />
      {vars && <div className="row wrap"><span className="muted xs">Insert where your cursor is:</span><div className="varchips">{vars.map((v) => <button type="button" key={v} onClick={() => insert(`{{${v}}}`)}>{`{{${v}}}`}</button>)}</div></div>}
      {rows.map((r, i) => (
        <div key={i} className="fblock">
          <div className="row"><span className="mono xs muted">{i + 1}</span><input className="inp card-bg" aria-label="Section heading" id={`sec-h-${i}`} value={r.heading} onChange={(e) => set(i, { heading: e.target.value })} style={{ fontWeight: 600 }} />
            <button type="button" className="ibtn xs" aria-label="Move up" onClick={() => move(i, -1)}><Icon name="up" /></button>
            <button type="button" className="ibtn xs" aria-label="Remove section" onClick={() => setRows((x) => x.filter((_, k) => k !== i))}><Icon name="trash" /></button></div>
          <textarea className="ta card-bg" aria-label="Section text" id={`sec-b-${i}`} rows={4} value={r.body} onFocus={(e) => (last.current = { i, el: e.currentTarget })} onChange={(e) => set(i, { body: e.target.value })} />
        </div>
      ))}
      <button type="button" className="btn" style={{ alignSelf: 'flex-start' }} onClick={() => setRows((x) => [...x, { heading: 'New section', body: '' }])}><Icon name="plus" />Add section</button>
    </div>
  );
}
