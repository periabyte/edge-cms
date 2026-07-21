---
"@edgecms/cli": minor
"edgecms": minor
---

**Breaking:** CI/non-interactive credential env vars renamed from `CLOUDFLARE_API_TOKEN` /
`CLOUDFLARE_ACCOUNT_ID` to `EDGE_API_TOKEN` / `EDGE_ACCOUNT_ID`, with no fallback to the old names.
This avoids silently picking up credentials already set in the shell for local `wrangler` use, which
could target the wrong Cloudflare account/token. Update any CI secrets, `.env` files, and the
`EdgeCMS Deploy` GitHub Action's secrets accordingly (the action's own `cloudflare-api-token` /
`cloudflare-account-id` input names are unchanged, only the env vars it sets internally).
