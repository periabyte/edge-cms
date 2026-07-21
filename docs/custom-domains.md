# Custom domains

By default `edgecms deploy` serves your site on a free `*.workers.dev` URL. To use
your own domain (e.g. `blog.example.com`), set it in config or pass a flag.

## Prerequisite

The domain must already be a **zone in your Cloudflare account** — i.e. its
nameservers point at Cloudflare. Add the site once at
[dash.cloudflare.com](https://dash.cloudflare.com) (Add a site → follow the
nameserver step). EdgeCMS can't do this for you because it requires a change at
your domain registrar.

## Usage

In `cms.config.ts`:

```ts
export default defineConfig({
  name: "my-site",
  domain: "blog.example.com",            // or ["example.com", "www.example.com"]
  // …
});
```

or per-deploy:

```bash
npx edgecms deploy --domain blog.example.com
```

On deploy, EdgeCMS attaches the domain to your Worker via Cloudflare's Workers
Custom Domains API — Cloudflare creates the proxied DNS record and provisions the
TLS certificate automatically. The step is **idempotent** (re-deploys don't
duplicate it) and **best-effort**: if the domain isn't a Cloudflare zone yet, the
deploy still succeeds on the `*.workers.dev` URL and prints guidance.

`edgecms login` requests DNS + Workers Routes permissions so this works with no
re-authentication. `edgecms down` detaches the domain before removing the Worker.

## Bonus

A custom domain is also what unlocks **Cloudflare Email Sending** for user
invites — onboard it once with `wrangler email sending enable <domain>`, then set
`email: { from: "hello@yourdomain.com" }` in your config.
