import { existsSync } from "node:fs";
import { CfClient, resolveCredentials, type CfCredentials } from "../cf/client.js";
import { ensureD1Database, executeRemoteSql, remoteUserCount } from "../cf/d1.js";
import { ensureHyperdrive, parseDatabaseUrl } from "../cf/hyperdrive.js";
import { ensureR2Bucket, ensureR2Cors } from "../cf/r2.js";
import { ensureKvNamespace } from "../cf/kv.js";
import { ensureVectorizeIndex } from "../cf/vectorize.js";
import { applyExternalMigration } from "../external-migrate.js";
import { uploadAssets } from "../cf/assets.js";
import { uploadWorkerScript, setWorkerSecret, enableWorkersDevSubdomain, type WorkerBinding } from "../cf/workers.js";
import { attachWorkerCustomDomain } from "../cf/domains.js";
import { enableEmailRouting, enableEmailSending, findZoneForHostname } from "../cf/email.js";
import { RUN_WORKER_FIRST } from "../wrangler-config.js";
import { buildWorkerBundle } from "../worker-bundle.js";
import { prepareProject } from "../project.js";
import { planMigration, checksumOf } from "../migration.js";
import { resolveAdminDist } from "../admin-assets.js";
import { lastSnapshot, readState, writeState, type EdgeCmsState } from "../state.js";

export interface DeployOptions {
  projectDir: string;
  /** Injectable for tests; defaults to a real client built from env credentials. */
  client?: CfClient;
  /** Path to the built admin SPA (packages/admin/dist in this monorepo). Assets are skipped if absent. */
  assetsDir?: string;
  /** Custom domain(s) to attach; overrides the config's `domain`. */
  domain?: string | string[];
}

export interface DeployResult {
  url: string;
  migrationApplied: boolean;
  resources: EdgeCmsState["resources"];
  /**
   * True when the deployment still has no admin user — the caller (CLI) offers
   * to bootstrap the root admin. Undefined for external-DB adapters, whose
   * users table isn't reachable over the D1 HTTP API.
   */
  needsAdminSetup?: boolean;
  /** The configured email from-address, when email is enabled (for an onboarding hint). */
  emailFrom?: string;
  /** True when a paid-plan feature (semantic search → Vectorize) is enabled. */
  usesPaidFeatures?: boolean;
  /** Custom domains successfully attached to the Worker. */
  customDomains?: string[];
  /** Non-fatal custom-domain attach failures (e.g. domain not on Cloudflare). */
  domainWarnings?: string[];
  /** True when the email from-address's domain was successfully onboarded for Email Routing + Sending. */
  emailDomainOnboarded?: boolean;
  /** Non-fatal email-domain onboarding failure (e.g. domain not on Cloudflare, or the token lacks permission). */
  emailWarning?: string;
}

const COMPATIBILITY_DATE = "2025-01-01";

/**
 * `kalayaan deploy`: idempotently provisions D1/R2/KV, applies any pending
 * schema migration to the remote database, bundles and uploads the Worker
 * (+ admin SPA assets if built), and prints the live URL. Safe to re-run —
 * every provisioning step checks for an existing resource by name first,
 * and .kalayaan/state.json is updated after each step so a failure partway
 * through leaves later re-runs able to pick up where it left off.
 */
export async function runDeploy(opts: DeployOptions): Promise<DeployResult> {
  const client = opts.client ?? new CfClient(await requireCredentials());
  // Ship the built admin SPA as Workers Assets. Defaults to @kalayaan/admin's
  // dist; skipped if neither an override nor a build is present.
  const assetsDir = opts.assetsDir ?? resolveAdminDist();

  let state = await readState(opts.projectDir);
  const prepared = await prepareProject(opts.projectDir, {
    ...(assetsDir && existsSync(assetsDir) && { assetsDir }),
  });
  const workerName = state.resources.worker?.name ?? prepared.loaded.resolved.name;
  const adapter = prepared.loaded.resolved.database.adapter;
  const external = adapter === "postgres" || adapter === "mysql";

  // 1. Provision resources idempotently, persisting IDs as we go so a
  // failure partway through this block doesn't lose earlier progress.
  // D1 is always provisioned for its default role; external databases add a
  // Hyperdrive config over the operator-supplied DATABASE_URL.
  const d1 = await ensureD1Database(client, `${workerName}-db`);
  state = await saveResources(opts.projectDir, state, { d1 });

  let databaseUrl: string | undefined;
  if (external) {
    databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl)
      throw new Error(
        `database.adapter is "${adapter}" — set DATABASE_URL to your Postgres/MySQL connection string before deploying.`,
      );
    const hyperdrive = await ensureHyperdrive(client, `${workerName}-hd`, parseDatabaseUrl(databaseUrl));
    state = await saveResources(opts.projectDir, state, { hyperdrive });
  }

  const semanticSearch =
    prepared.loaded.resolved.ai.enabled &&
    prepared.loaded.resolved.ai.features.includes("semantic-search");
  if (semanticSearch) {
    const vectorize = await ensureVectorizeIndex(
      client,
      `${workerName}-search`,
      prepared.loaded.resolved.ai.embedDimensions,
    );
    state = await saveResources(opts.projectDir, state, { vectorize });
  }

  const r2 = await ensureR2Bucket(client, `${workerName}-media`);
  await ensureR2Cors(client, r2.name);
  state = await saveResources(opts.projectDir, state, { r2 });

  const cacheKv = await ensureKvNamespace(client, `${workerName}-cache`);
  const sessionsKv = await ensureKvNamespace(client, `${workerName}-sessions`);
  state = await saveResources(opts.projectDir, state, { kv: { cache: cacheKv, sessions: sessionsKv } });
  // Preserve secretsInitialized from any prior deploy — this merge must
  // not clobber it before the first-deploy-only check further down.
  const priorSecretsInitialized = state.resources.worker?.secretsInitialized;
  state = await saveResources(opts.projectDir, state, {
    worker: { name: workerName, ...(priorSecretsInitialized !== undefined && { secretsInitialized: priorSecretsInitialized }) },
  });

  // 2. Reconcile system tables on every deploy, then apply any pending
  // config-driven schema migration to the remote database. System DDL is all
  // CREATE ... IF NOT EXISTS (idempotent), so it self-heals missing/newly-added
  // system tables on existing deployments without a journal entry.
  const plan = planMigration(prepared.loaded.resolved, lastSnapshot(state));
  if (external) {
    // System tables + config diff go straight to the external DB via the
    // driver; there's no D1 HTTP journal to reconcile against here.
    await applyExternalMigration(prepared.loaded.resolved, databaseUrl!, plan);
  } else {
    await executeRemoteSql(
      client,
      d1.id,
      plan.systemStatements.map((s) => s.sql),
    );
    if (plan.systemReconcileStatements.length > 0) {
      await executeRemoteSql(
        client,
        d1.id,
        plan.systemReconcileStatements.map((s) => s.sql),
        { tolerateDuplicateColumn: true },
      );
    }
  }
  let migrationApplied = false;
  if (plan.statements.length > 0) {
    if (!external) {
      await executeRemoteSql(
        client,
        d1.id,
        plan.statements.map((s) => s.sql),
      );
    }
    const checksum = await checksumOf(plan.sql);
    state = {
      ...state,
      schema: { snapshotVersion: 1, collections: plan.nextSnapshot.collections },
      migrations: [...state.migrations, { id: crypto.randomUUID(), checksum, appliedAt: Date.now() }],
    };
    await writeState(opts.projectDir, state);
    migrationApplied = true;
  }

  // 3. Regenerate build artifacts now that state has real resource IDs, then bundle.
  const rebuilt = await prepareProject(opts.projectDir, {
    ...(assetsDir && existsSync(assetsDir) && { assetsDir }),
  });
  const code = await buildWorkerBundle(rebuilt.entryPath);

  // 4. Upload assets (if built) and the Worker script. The script must be
  // created BEFORE any secret is set: on a first-ever deploy the script
  // doesn't exist yet, and Cloudflare's secrets endpoint rejects with
  // "This Worker does not exist on your account." if called first.
  const assetsJwt =
    assetsDir && existsSync(assetsDir) ? await uploadAssets(client, workerName, assetsDir) : undefined;

  const bindings: WorkerBinding[] = [
    { type: "d1", name: "DB", id: d1.id },
    { type: "r2_bucket", name: "MEDIA", bucket_name: r2.name },
    { type: "kv_namespace", name: "SESSIONS", namespace_id: sessionsKv },
  ];
  // External databases reach the Worker through a Hyperdrive binding.
  if (external && state.resources.hyperdrive)
    bindings.push({ type: "hyperdrive", name: "HYPERDRIVE", id: state.resources.hyperdrive.id });
  // Workers AI needs no provisioning — just the binding when AI is enabled.
  if (rebuilt.loaded.resolved.ai.enabled) bindings.push({ type: "ai", name: "AI" });
  // Semantic search needs a Vectorize index binding.
  if (
    rebuilt.loaded.resolved.ai.enabled &&
    rebuilt.loaded.resolved.ai.features.includes("semantic-search") &&
    state.resources.vectorize
  )
    bindings.push({ type: "vectorize", name: "VECTORIZE", index_name: state.resources.vectorize.name });
  // Cloudflare Email Sending needs the binding; the from-domain's zone is
  // onboarded separately, further down (step 7), via the Email Routing/Sending
  // REST API rather than requiring `wrangler email sending enable` out of band.
  if (rebuilt.loaded.resolved.email.from) bindings.push({ type: "send_email", name: "EMAIL" });
  await uploadWorkerScript(client, {
    name: workerName,
    code,
    mainModuleFilename: "worker.js",
    compatibilityDate: COMPATIBILITY_DATE,
    bindings,
    ...(assetsJwt && {
      assetsJwt,
      // Serve the admin SPA: unmatched non-API paths (e.g. /admin) fall back to
      // index.html; API/media/mcp prefixes always hit the Worker first.
      assetsConfig: { not_found_handling: "single-page-application", run_worker_first: RUN_WORKER_FIRST },
    }),
  });

  // 5. Set secrets once on first deploy only, AFTER the script exists.
  // Subsequent script uploads pass keep_secrets:true (see uploadWorkerScript),
  // so the secret survives redeploys without being re-set — and
  // .kalayaan/state.json never stores the value.
  if (!state.resources.worker?.secretsInitialized) {
    const secret = crypto.randomUUID() + crypto.randomUUID();
    await setWorkerSecret(client, workerName, "SESSION_SECRET", secret);
    state = await saveResources(opts.projectDir, state, {
      worker: { name: workerName, secretsInitialized: true },
    });
  }

  // Turnstile secret for public submissions is operator-supplied (not generated):
  // set it from the environment whenever present. Re-setting on redeploy allows
  // rotation; the value is never persisted to state.
  if (process.env.TURNSTILE_SECRET)
    await setWorkerSecret(client, workerName, "TURNSTILE_SECRET", process.env.TURNSTILE_SECRET);

  const { url } = await enableWorkersDevSubdomain(client, workerName);

  // 6. Attach custom domains (flag overrides config). Best-effort: a domain
  // that isn't a Cloudflare zone yet must not fail the whole deploy — the site
  // is already live on the workers.dev URL.
  const wanted = normalizeDomains(opts.domain) ?? rebuilt.loaded.resolved.domain;
  const customDomains: string[] = [];
  const domainWarnings: string[] = [];
  if (wanted.length > 0) {
    const attached: { hostname: string; id: string }[] = [];
    for (const hostname of wanted) {
      try {
        const domain = await attachWorkerCustomDomain(client, { hostname, service: workerName });
        attached.push(domain);
        customDomains.push(domain.hostname);
      } catch (err) {
        domainWarnings.push(
          `Could not attach ${hostname}: ${err instanceof Error ? err.message : String(err)}. ` +
            `Make sure ${hostname} is a zone in your Cloudflare account (add the site at dash.cloudflare.com first).`,
        );
      }
    }
    if (attached.length > 0) state = await saveResources(opts.projectDir, state, { domains: attached });
  }

  // 7. Onboard the email from-domain for Email Routing + Sending. Best-effort,
  // same posture as custom domains: a domain that isn't a Cloudflare zone yet
  // (or a token missing the email permission) must not fail the whole deploy —
  // invites already degrade to a copyable link when sends fail.
  let emailDomainOnboarded: boolean | undefined;
  let emailWarning: string | undefined;
  const emailFromDomain = rebuilt.loaded.resolved.email.from?.split("@")[1];
  if (emailFromDomain) {
    try {
      const zone = await findZoneForHostname(client, emailFromDomain);
      if (!zone) {
        emailWarning = `Could not onboard ${emailFromDomain} for email: it isn't a zone in your Cloudflare account yet (add the site at dash.cloudflare.com first). Invites will use the copyable-link fallback until then.`;
      } else {
        await enableEmailRouting(client, zone.id);
        await enableEmailSending(client, zone.id, emailFromDomain);
        emailDomainOnboarded = true;
        state = await saveResources(opts.projectDir, state, {
          emailDomain: { hostname: emailFromDomain, zoneId: zone.id },
        });
      }
    } catch (err) {
      emailWarning = `Could not onboard ${emailFromDomain} for email: ${err instanceof Error ? err.message : String(err)}. Invites will use the copyable-link fallback until this is resolved.`;
    }
  }

  // Whether the root admin still needs creating (fresh deploy → zero users).
  // Only checkable for D1; external DBs aren't reachable over the D1 HTTP API.
  const needsAdminSetup = external ? undefined : (await remoteUserCount(client, d1.id)) === 0;

  return {
    url,
    migrationApplied,
    resources: state.resources,
    ...(needsAdminSetup !== undefined && { needsAdminSetup }),
    ...(rebuilt.loaded.resolved.email.from && { emailFrom: rebuilt.loaded.resolved.email.from }),
    ...(rebuilt.loaded.resolved.ai.enabled &&
      rebuilt.loaded.resolved.ai.features.includes("semantic-search") && { usesPaidFeatures: true }),
    ...(customDomains.length > 0 && { customDomains }),
    ...(domainWarnings.length > 0 && { domainWarnings }),
    ...(emailDomainOnboarded !== undefined && { emailDomainOnboarded }),
    ...(emailWarning && { emailWarning }),
  };
}

/** Normalize a --domain flag value (string or array) to a list, or undefined when unset. */
function normalizeDomains(domain: string | string[] | undefined): string[] | undefined {
  if (domain === undefined) return undefined;
  return Array.isArray(domain) ? domain : [domain];
}

async function requireCredentials(): Promise<CfCredentials> {
  const creds = await resolveCredentials();
  if (!creds)
    throw new Error(
      "Not signed in to Cloudflare. Run `kalayaan login`, or set EDGE_API_TOKEN + EDGE_ACCOUNT_ID (CI).",
    );
  return creds;
}

interface ResourcesPatch {
  d1?: { id: string; name: string };
  r2?: { name: string };
  kv?: { cache: string; sessions: string };
  hyperdrive?: { id: string };
  vectorize?: { name: string };
  worker?: { name: string; secretsInitialized?: boolean };
  domains?: { hostname: string; id: string }[];
  emailDomain?: { hostname: string; zoneId: string };
}

async function saveResources(
  projectDir: string,
  state: EdgeCmsState,
  patch: ResourcesPatch,
): Promise<EdgeCmsState> {
  const next: EdgeCmsState = { ...state, resources: { ...state.resources, ...patch } };
  await writeState(projectDir, next);
  return next;
}
