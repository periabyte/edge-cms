# edgecms/deploy-action

A GitHub Action that deploys an [EdgeCMS](../../README.md) project to Cloudflare.
It wraps `edgecms deploy`: idempotently provisioning D1/R2/KV (and
Hyperdrive/Vectorize when configured), applying pending migrations to the remote
database, uploading the Worker plus the admin SPA, and attaching a custom domain
when one is configured.

## Usage

```yaml
name: Deploy CMS
on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - id: cms
        uses: edgecms/deploy-action@v1
        with:
          cloudflare-api-token: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          cloudflare-account-id: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
          working-directory: .
      - run: echo "Deployed to ${{ steps.cms.outputs.url }}"
```

## Inputs

| Input                   | Required | Default | Description                                                     |
| ----------------------- | -------- | ------- | --------------------------------------------------------------- |
| `cloudflare-api-token`  | yes      |         | Token with Workers/D1/R2/KV — plus DNS + Workers Routes when attaching a custom domain. `edgecms login` mints one with the right scopes. |
| `cloudflare-account-id` | yes      |         | Cloudflare account ID.                                          |
| `working-directory`     | no       | `.`     | Directory containing `cms.config.ts`.                           |
| `database-url`          | no       | `""`    | Postgres/MySQL connection string (external-DB projects only).   |
| `node-version`          | no       | `20`    | Node.js version.                                                |
| `args`                  | no       | `""`    | Extra flags for `edgecms deploy` (e.g. `--domain blog.example.com`). |

## Outputs

| Output | Description               |
| ------ | ------------------------- |
| `url`  | The deployed Worker URL.  |

## Guardrails

The action runs `edgecms deploy`, which applies **non-destructive** migrations
only. Destructive schema changes require `--allow-destructive`, which is never
passed automatically — run those deliberately (locally or via `args`) after
reviewing the migration SQL with `edgecms migrate --dry-run`.
