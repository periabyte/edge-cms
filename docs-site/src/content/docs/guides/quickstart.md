---
title: Quickstart
description: From an empty folder to a live site on your own Cloudflare account.
---

EdgeCMS deploys entirely onto your own Cloudflare account — Workers, D1, R2, and KV, all on the
permanent free tier. There's no separate hosting to sign up for and no server to manage.

## 1. Sign in

```sh
npx edgecms login
```

A one-time guided sign-in: it opens a Cloudflare API token page with the right permissions
pre-filled, and auto-discovers your account. Credentials are stored at
`~/.edgecms/credentials.json` — `init`, `dev`, `deploy`, and `down` all pick them up automatically,
no environment variables needed locally.

## 2. Scaffold a project

```sh
npx edgecms init my-site
```

`init` is a guided wizard. It asks for:

- your content models (or pick a starter template — blog, portfolio, docs, or blank),
- which optional services to turn on (AI features, email invites, a custom domain, public
  submissions),
- and whether to deploy right at the end of the wizard.

It writes `cms.config.ts` and a `package.json` for your project.

## 3. Run it locally

```sh
cd my-site
npm install
npx edgecms dev
```

`dev` runs your whole CMS locally under `workerd` (Cloudflare's actual Workers runtime), backed by
local D1/R2/KV — no Cloudflare account calls needed for local development. Add `--host` to make it
reachable on your LAN.

## 4. Deploy

```sh
npx edgecms deploy
```

`deploy` is idempotent and safe to re-run — it provisions D1, R2, and KV, applies any pending
schema migration, uploads the Worker **and** the admin SPA, sets up first-run secrets, and prints
your live URL (`https://my-site.<you>.workers.dev`).

To use your own domain instead:

```sh
npx edgecms deploy --domain blog.example.com
```

See the [custom domains guide](/edge-cms/guides/custom-domains/) for the one prerequisite (the
domain needs to already be a Cloudflare zone).

On first deploy, create your admin account at `<your-url>/admin` — or bootstrap it
non-interactively with `--admin-email`/`--admin-password` for CI.

## 5. Tear it down

```sh
npx edgecms down
```

Detaches any custom domain and deletes the deployed Worker and every resource it provisioned
(D1, R2, KV, and Hyperdrive/Vectorize if you enabled them). Asks for confirmation unless you pass
`--yes`.

## What's next

- [Define your content model](/edge-cms/guides/schema-and-config/) in `cms.config.ts`.
- [Set up roles and API tokens](/edge-cms/guides/roles-and-access/) for your team or integrations.
- [Turn on AI features](/edge-cms/guides/ai-features/) — alt-text, translation, editorial assist,
  and semantic search.
