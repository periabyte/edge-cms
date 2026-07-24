import type { EmailMessage } from "@kalayaan/core";

/** Invite email: a plain, client-safe template (inline styles, html + text). */
export function inviteEmail(opts: { to: string; url: string; projectName: string; temporaryPassword: string }): EmailMessage {
  const { to, url, projectName, temporaryPassword } = opts;
  const subject = `You've been invited to ${projectName}`;
  const text = [
    `You've been invited to ${projectName}.`,
    ``,
    `Set your own password to get started:`,
    url,
    ``,
    `Or sign in right away with this temporary password: ${temporaryPassword}`,
    ``,
    `This link expires in 7 days. If you weren't expecting this, you can ignore this email.`,
  ].join("\n");
  const html = `<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:480px;margin:0 auto;color:#111">
  <h2 style="font-size:18px;margin:0 0 12px">You've been invited to ${escapeHtml(projectName)}</h2>
  <p style="font-size:14px;line-height:1.5;margin:0 0 20px">Set your own password to get started.</p>
  <p style="margin:0 0 24px"><a href="${escapeAttr(url)}" style="display:inline-block;background:#111;color:#fff;text-decoration:none;font-size:14px;font-weight:600;padding:10px 18px;border-radius:8px">Set your password</a></p>
  <p style="font-size:13px;line-height:1.5;margin:0 0 20px">Or sign in right away with this temporary password: <code style="background:#f2f2f2;padding:2px 6px;border-radius:4px;font-size:13px">${escapeHtml(temporaryPassword)}</code></p>
  <p style="font-size:12px;color:#666;line-height:1.5;margin:0">This link expires in 7 days. If you weren't expecting this, you can ignore this email.</p>
</div>`;
  return { to, subject, html, text };
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]!);
}

function escapeAttr(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
}
