---
"@edgecms/runtime": patch
---

Cap PBKDF2 password hashing at 100,000 iterations (was 600,000).

Cloudflare's deployed WebCrypto rejects PBKDF2 iteration counts above 100k with
`NotSupportedError: Pbkdf2 failed: iteration counts above 100000 are not supported`,
so every first-run admin setup and login threw on a real Worker (returning a generic
500) even though it worked in local dev, whose workerd doesn't enforce the cap. 100k
is the platform maximum; a regression test now pins the iteration count at or below it.
