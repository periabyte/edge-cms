# Roadmap: pluggable email providers (Resend)

Kalayaan ships transactional email (user invites) with **Cloudflare Email Sending**
as the built-in provider. This note describes the planned path to a **Resend
plugin** — it is not yet implemented.

## Where email lives today

- `EmailProvider` interface + `EmailMessage` type — `packages/core/src/email.ts`
  (a shared contract, mirroring `AIProvider`).
- `CloudflareEmailProvider` — `packages/runtime/src/email/cloudflare-email-provider.ts`,
  wrapping the `send_email` Worker binding (`env.EMAIL`).
- Config — `email?: { provider?: "cloudflare" | "resend"; from; fromName?; replyTo?; baseUrl? }`
  (`packages/config/src/types.ts`). `provider: "resend"` is already accepted by
  the type/schema but is not yet handled by the runtime.
- Injection — `app.ts` sets `c.var.email` to a `CloudflareEmailProvider` when
  `config.email.from` and the `EMAIL` binding are both present.
- Consumer — `packages/runtime/src/routes/admin-users.ts` sends the invite via
  `c.var.email?.send(...)`, degrading to a copyable invite link when unset.

## What a Resend plugin needs

The `Plugin` interface (`packages/core/src/plugin.ts`) currently exposes only
lifecycle hooks + custom field types — **there is no seam for contributing a
service/provider.** Two steps unlock a Resend (or any) provider:

1. **Add a provider seam to `Plugin`**, e.g.:
   ```ts
   export interface Plugin {
     name: string;
     fieldTypes?: ...;
     hooks?: ...;
     /** Contribute an email sender, built from the Worker env at request time. */
     email?: (env: unknown) => EmailProvider;
   }
   ```
   Surface it on `PluginHost` (`emailProvider(env): EmailProvider | undefined` —
   last plugin wins), and in `createApp` prefer a plugin-supplied provider over
   the `EMAIL`-binding `CloudflareEmailProvider`. Plugins already thread through
   `createApp` (`entry-template.ts` → `{ plugins }`), so no new loading path is
   needed. Gate selection on `config.email.provider`.

2. **Ship `@kalayaan/plugin-resend`** — an `EmailProvider` backed by Resend's REST
   API (`POST https://api.resend.com/emails`) using a `RESEND_API_KEY` Worker
   secret. Usage:
   ```ts
   // cms.plugins.ts
   import { resend } from "@kalayaan/plugin-resend";
   export default [resend()];
   // cms.config.ts
   email: { provider: "resend", from: "hello@yourdomain.com" }
   ```
   The CLI would set `RESEND_API_KEY` as a Worker secret from the environment
   (mirroring `TURNSTILE_SECRET` in `commands/deploy.ts`), and skip adding the
   `send_email` binding when `provider === "resend"`.

## Why not now

Cloudflare Email Sending covers the default case with zero extra dependencies or
API keys (just an onboarded domain). Resend is valuable when a project already
uses Resend or wants its analytics/deliverability, but it introduces an external
dependency and a provider-seam refactor to `Plugin` that is better done as its
own change.
