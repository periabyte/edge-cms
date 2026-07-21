---
"@edgecms/cli": minor
---

Fix two first-deploy bugs and add interactive root-admin bootstrap to `edgecms deploy`.

Both bugs only surfaced on the first real Cloudflare deploy (the mocked deploy test
couldn't exercise the live handshakes):

- **Secret set before the script existed.** `deploy` pushed `SESSION_SECRET` before
  uploading the Worker script, so a first deploy failed with "This Worker does not
  exist on your account." The script is now uploaded first, then the secret.
- **Assets uploaded with the wrong credential.** The Workers Assets file-upload call
  authenticated with the account API token instead of the per-session upload JWT
  (Cloudflare rejected it as a malformed JWT), and it short-circuited before actually
  uploading when files were pending. Uploads now use the session JWT, send each file
  base64-encoded with its content type, and only skip when nothing has changed.
- **Redeploys wiped `SESSION_SECRET`.** The Module Upload API replaces a Worker's
  bindings on every PUT, and the secret (set separately, once) wasn't in that list — so
  the second deploy dropped it and auth 500'd. The script upload now sends
  `keep_secrets: true` to retain previously-set secrets across redeploys.
- **The admin SPA wasn't served.** The deploy uploaded the assets bundle but not its
  routing config, so a deployed `GET /admin` had no `index.html` fallback and fell
  through to the Worker (`No route: GET /admin`). The upload now includes the assets
  `config` (`not_found_handling: single-page-application` + the `run_worker_first`
  prefixes), matching what `dev` generates.

**New — first-run admin setup.** After a successful deploy, if the deployment has no
admin user yet, `deploy` offers to create the root admin: it prompts for email +
password (masked, confirmed) on a TTY, or runs non-interactively with `--admin-email`
+ `--admin-password` (or `EDGECMS_ADMIN_PASSWORD`); `--no-admin-setup` skips it. The
admin is created via the deployed Worker's `/admin/api/auth/setup` endpoint, so the
password hashing always matches the runtime.
