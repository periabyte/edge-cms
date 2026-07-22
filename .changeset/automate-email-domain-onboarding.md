---
"@edgecms/cli": minor
"@edgecms/runtime": patch
"edgecms": minor
---

`edgecms deploy` now onboards the email `from`-address's domain for Cloudflare Email Routing +
Sending automatically via the REST API, instead of requiring a manual `wrangler email sending
enable <domain>` step. Best-effort, same posture as custom domain attach: if the domain isn't a
Cloudflare zone yet (or the token lacks the new email permission), the deploy still succeeds and
invites fall back to a copyable link. `edgecms login`'s token template now also requests Zone ·
Email Routing Settings/Rules · Edit.
