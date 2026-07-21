---
"@edgecms/runtime": minor
"@edgecms/admin": minor
"@edgecms/cli": minor
---

Add a Strapi-style one-time admin setup flow and an `edgecms down` teardown command.

- **Dedicated first-run screen.** The admin now auto-detects when a deployment has no
  admin yet (via a new public `GET /admin/api/auth/setup` → `{ needsSetup }`) and shows a
  one-time "Create your first administrator" screen with password confirmation, flipping
  to the sign-in screen once the account exists. The login page no longer carries a
  manual setup toggle.
- **Deploy points you at it.** After a successful deploy, `edgecms deploy` polls the
  workers.dev route until it's actually live, then prints the `/admin` setup link instead
  of prompting for a password. `--admin-email` + `--admin-password` (or
  `EDGECMS_ADMIN_PASSWORD`) still bootstrap the admin non-interactively for CI/agents.
- **`edgecms down`.** Tears down everything a deploy provisioned — the Worker, D1, KV
  namespaces, R2 bucket, and any Vectorize/Hyperdrive — reading `.edgecms/state.json`,
  confirming first (unless `--yes`), deleting the Worker before its bindings, and
  resetting local state so a later deploy provisions cleanly.
