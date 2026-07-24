# Releasing

Publishing `@edgecms/*` + `kalayaan` to npm is triggered by publishing a **GitHub Release** —
nothing publishes automatically on every merge to `main`. Versions are bumped manually first, so
you review the changelog before anything ships.

## One-time setup (do before the first release)

1. **npm**: create/confirm the `@edgecms` npm org (or scope) and the `kalayaan` package name are
   yours, then generate an **automation** access token (npmjs.com → Access Tokens → Generate New
   Token → Automation — bypasses 2FA prompts so CI can use it non-interactively).
2. **GitHub repo secret**: add that token as `NPM_TOKEN` (Settings → Secrets and variables →
   Actions → New repository secret). Until this exists, `.github/workflows/release.yml` no-ops
   with a warning instead of failing.
3. Make sure `main` is the default branch and has a git remote (`git remote -v`).

## Every release

All packages release in lockstep (`.changeset/config.json`'s `fixed` group), so they always share
one version number.

```sh
# 1. Turn pending changesets (added via `pnpm changeset` as features/fixes land)
#    into version bumps + CHANGELOG entries. Several may already be pending —
#    check with `ls .changeset/*.md`.
pnpm changeset version

# 2. Review the diff: package.json versions + CHANGELOG.md files.
git diff

# 3. Commit, tag, and push.
git add -A
git commit -m "chore: release vX.Y.Z"
git tag vX.Y.Z
git push origin main --tags

# 4. Cut the GitHub Release from that tag — THIS is what triggers the publish workflow.
gh release create vX.Y.Z --generate-notes
```

`gh release create` opens the release with auto-generated notes from commits/PRs since the last
tag — edit them in the prompt (or `--notes-file`) before confirming if you want custom wording.
Publishing the release fires `.github/workflows/release.yml`: build → typecheck → test →
`pnpm changeset publish`, which only pushes packages whose local version isn't already on npm
(safe to re-run if the release gets re-published or a step needs retrying).

## Verifying

```sh
npx kalayaan@latest --version
npm view kalayaan versions --json
```
