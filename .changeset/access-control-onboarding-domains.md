---
"@edgecms/config": minor
"@edgecms/core": minor
"@edgecms/runtime": minor
"@edgecms/admin": minor
"@edgecms/cli": minor
"@edgecms/adapter-d1": minor
"@edgecms/adapter-postgres": minor
"@edgecms/adapter-mysql": minor
"edgecms": minor
---

Access control, email invites, public submissions, guided onboarding, and custom domains.

- **RBAC + scoped tokens:** config-defined roles and permissions (an `Ability`
  model: `action × subject`) enforced across the REST and MCP surfaces for users
  and API tokens alike. API tokens gained granular grants, expiry, and
  revocation; an `audit_log` records management actions.
- **Email invites:** an `EmailProvider` seam with a Cloudflare Email Sending
  provider and an `email` config block. Admins invite by email; the invitee sets
  their own password via a signed accept-link, degrading to a copyable link when
  email isn't configured.
- **Public access:** a reserved `public` role gives anonymous requests an
  ability; the content API gates reads on it, and a moderated public submission
  endpoint (anonymous create → draft) sits behind Cloudflare Turnstile + per-IP
  rate limiting.
- **Guided onboarding:** `edgecms login` (pre-filled token page + account
  auto-discovery, credentials stored under `~/.edgecms/`), and `edgecms init` is
  now a wizard that picks content models and services and can deploy at the end.
  Defaults enable only free Cloudflare services, with a heads-up before the one
  paid feature (semantic search → Vectorize).
- **Custom domains:** a `domain` config option (or `deploy --domain`); deploy
  attaches a Workers Custom Domain with automatic DNS + TLS and detaches it on
  `down`. The login token now carries DNS + Workers Routes permissions.
