import 'server-only';
import { env } from './env';

interface Mail { to: string; subject: string; heading: string; lines: string[]; button?: { label: string; url: string }; studio: { name: string; color?: string }; replyTo?: string }

const escapeHtml = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

function render(m: Mail) {
  const color = m.studio.color || '#1677D2';
  const html = `<!doctype html><html><body style="margin:0;background:#EAF5FF;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#0D2440">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px"><tr><td align="center">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#fff;border-radius:20px;padding:32px">
  <tr><td style="font-size:13px;color:#6B819A;padding-bottom:20px">${escapeHtml(m.studio.name)}</td></tr>
  <tr><td style="font-size:22px;font-weight:600;padding-bottom:12px">${escapeHtml(m.heading)}</td></tr>
  ${m.lines.map((l) => `<tr><td style="font-size:15px;line-height:1.6;color:#34506E;padding-bottom:12px">${escapeHtml(l)}</td></tr>`).join('')}
  ${m.button ? `<tr><td style="padding:12px 0 8px"><a href="${m.button.url}" style="display:inline-block;background:${color};color:#fff;text-decoration:none;padding:12px 22px;border-radius:999px;font-size:15px;font-weight:500">${escapeHtml(m.button.label)}</a></td></tr>
  <tr><td style="font-size:12px;color:#6B819A;padding-top:8px;word-break:break-all">${m.button.url}</td></tr>` : ''}
  </table></td></tr></table></body></html>`;
  const text = [m.heading, '', ...m.lines, '', m.button ? `${m.button.label}: ${m.button.url}` : ''].join('\n');
  return { html, text };
}

/** Sends through Resend. Without RESEND_API_KEY the email is printed to the server log instead. */
export async function sendEmail(m: Mail): Promise<{ sent: boolean }> {
  const { html, text } = render(m);
  if (!env.resendKey) {
    console.log(`\n[email:dev] to=${m.to}\nsubject=${m.subject}\n${text}\n`);
    return { sent: false };
  }
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.resendKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: env.emailFrom, to: [m.to], subject: m.subject, html, text, reply_to: m.replyTo }),
  });
  if (!res.ok) console.error('[email] Resend error', res.status, await res.text());
  return { sent: res.ok };
}
