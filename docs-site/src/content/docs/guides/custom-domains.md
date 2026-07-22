---
title: Custom domains
description: Serve your EdgeCMS site on your own domain instead of *.workers.dev.
---

By default, `edgecms deploy` serves your site on a free `*.workers.dev` URL. To use your own
domain (e.g. `blog.example.com`), set it in config or pass a flag — no separate DNS/TLS setup
required.

## Prerequisite

The domain must already be a **zone in your Cloudflare account** — i.e. its nameservers point at
Cloudflare. Add the site once at [dash.cloudflare.com](https://dash.cloudflare.com) (Add a site →
follow the nameserver step). EdgeCMS can't do this step for you, since it requires a change at your
domain registrar.

## Usage

In `cms.config.ts`:

```ts
export default defineConfig({
  name: "my-site",
  domain: "blog.example.com",            // or ["example.com", "www.example.com"]
  // …
});
```

or per-deploy, without touching config:

```sh
npx edgecms deploy --domain blog.example.com
```

On deploy, EdgeCMS attaches the domain to your Worker via Cloudflare's Workers Custom Domains
API — Cloudflare creates the proxied DNS record and provisions the TLS certificate automatically.
The step is:

- **idempotent** — re-deploying doesn't duplicate the attachment, and
- **best-effort** — if the domain isn't a Cloudflare zone yet, the deploy still succeeds on the
  `*.workers.dev` URL and prints guidance instead of failing outright.

`edgecms login` requests the DNS + Workers Routes permissions this needs up front, so there's no
re-authentication step later. `edgecms down` detaches the domain before deleting the Worker.

## Bonus: email sending

A custom domain is also what unlocks **Cloudflare Email Sending** for user invites — onboard it
once with `wrangler email sending enable <domain>`, then set `email: { from:
"hello@yourdomain.com" }` in your config. Without a configured email provider, invites still work —
they degrade to a copyable invite link you can send however you like.
