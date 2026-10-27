'use client';
import { useEffect, useRef, useState } from 'react';
import { Icon } from './Icon';
import { Submit } from './client';

/** Typed or drawn e-signature. Posts kind, typed, drawing (PNG data URL), name and agree to the given server action. */
export function SignPad({ action, hidden, defaultName }: { action: (fd: FormData) => Promise<void>; hidden: Record<string, string>; defaultName: string }) {
  const [kind, setKind] = useState<'typed' | 'drawn'>('typed');
  const [name, setName] = useState(defaultName);
  const [typed, setTyped] = useState(defaultName);
  const [drawing, setDrawing] = useState('');
  const [agree, setAgree] = useState(false);
  const cv = useRef<HTMLCanvasElement>(null);
  const drawn = useRef(false);

  useEffect(() => {
    if (kind !== 'drawn') return;
    const c = cv.current; if (!c) return;
    const ratio = window.devicePixelRatio || 1;
    c.width = c.clientWidth * ratio; c.height = c.clientHeight * ratio;
    const ctx = c.getContext('2d')!; ctx.scale(ratio, ratio);
    ctx.lineWidth = 2.2; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = '#111';
    let down = false; let last: [number, number] = [0, 0];
    const pos = (e: PointerEvent): [number, number] => { const r = c.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
    const start = (e: PointerEvent) => { down = true; last = pos(e); c.setPointerCapture(e.pointerId); };
    const move = (e: PointerEvent) => { if (!down) return; const p = pos(e); ctx.beginPath(); ctx.moveTo(...last); ctx.lineTo(...p); ctx.stroke(); last = p; drawn.current = true; };
    const end = () => { if (!down) return; down = false; if (drawn.current) setDrawing(c.toDataURL('image/png')); };
    c.addEventListener('pointerdown', start); c.addEventListener('pointermove', move); c.addEventListener('pointerup', end); c.addEventListener('pointerleave', end);
    return () => { c.removeEventListener('pointerdown', start); c.removeEventListener('pointermove', move); c.removeEventListener('pointerup', end); c.removeEventListener('pointerleave', end); };
  }, [kind]);

  const clear = () => { const c = cv.current; if (c) c.getContext('2d')!.clearRect(0, 0, c.width, c.height); drawn.current = false; setDrawing(''); };
  const ready = agree && name.trim().length > 1 && (kind === 'typed' ? typed.trim().length > 1 : !!drawing);

  return (
    <form action={action} className="col g12">
      {Object.entries(hidden).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      <input type="hidden" name="kind" value={kind} /><input type="hidden" name="drawing" value={drawing} />
      <label className="field"><span>Full legal name</span><input className="inp" name="name" id="sg-name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" required /></label>
      <div className="seg sm" role="group" aria-label="Signature style" style={{ alignSelf: 'flex-start' }}>
        <button type="button" aria-pressed={kind === 'typed'} onClick={() => setKind('typed')}>Type</button>
        <button type="button" aria-pressed={kind === 'drawn'} onClick={() => setKind('drawn')}>Draw</button>
      </div>
      {kind === 'typed' ? <>
        <input className="inp" name="typed" id="sg-typed" value={typed} onChange={(e) => setTyped(e.target.value)} aria-label="Type your signature" />
        <div className="typedsig" aria-hidden>{typed}</div>
      </> : <>
        <canvas ref={cv} className="sigpad" aria-label="Draw your signature with your finger or mouse" />
        <div className="row"><span className="muted xs">{drawing ? 'Looks good' : 'Sign inside the box'}</span><span className="sp" /><button type="button" className="btn sm ghost" onClick={clear}><Icon name="x" />Clear</button></div>
        <input type="hidden" name="typed" value="" />
      </>}
      <label className="check"><input type="checkbox" name="agree" checked={agree} onChange={(e) => setAgree(e.target.checked)} /><span>I agree to sign this agreement electronically, and that my electronic signature is as binding as a handwritten one.</span></label>
      <Submit className="btn primary lg block" pending="Signing…" disabled={!ready}><Icon name="sign" />Sign agreement</Submit>
    </form>
  );
}
