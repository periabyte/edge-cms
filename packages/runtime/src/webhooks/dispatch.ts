import type { Doc } from "@edgecms/core";
import { hmacSign } from "../auth/tokens.js";
import type { DocStatus } from "../status.js";
import { WebhookStore, type WebhookEvent } from "./webhook-store.js";

export interface WebhookPayload {
  event: WebhookEvent;
  collection: string;
  id: string;
  status?: DocStatus;
  doc?: Doc | null;
  at: number;
}

/**
 * Fire-and-forget delivery of a webhook event to every active subscriber.
 * Each POST is signed with the subscriber's secret (HMAC-SHA256 over the raw
 * JSON body) and dispatched via `executionCtx.waitUntil`, so it never blocks
 * or fails the originating admin request. Delivery failures are swallowed.
 *
 * Not awaited by callers: the whole thing is scheduled inside waitUntil so a
 * slow `webhooks` query can't delay the response either.
 */
/** Minimal shape of the bits of ExecutionContext we use — avoids workers-types version skew. */
export interface WaitUntilCtx {
  waitUntil(promise: Promise<unknown>): void;
}

export function dispatch(
  db: D1Database,
  executionCtx: WaitUntilCtx,
  event: WebhookEvent,
  payload: WebhookPayload,
): void {
  executionCtx.waitUntil(deliver(db, event, payload));
}

async function deliver(db: D1Database, event: WebhookEvent, payload: WebhookPayload): Promise<void> {
  let hooks;
  try {
    hooks = await new WebhookStore(db).listActiveForEvent(event);
  } catch {
    return;
  }
  const body = JSON.stringify(payload);
  await Promise.all(
    hooks.map(async (hook) => {
      try {
        const sig = await hmacSign(hook.secret, body);
        await fetch(hook.url, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-kalayaan-event": event,
            "x-kalayaan-signature": `sha256=${sig}`,
          },
          body,
        });
      } catch {
        // fire-and-forget: never surface delivery errors to the admin request
      }
    }),
  );
}
