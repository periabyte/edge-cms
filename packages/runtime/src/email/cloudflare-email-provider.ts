import { EdgeCMSError, type EmailMessage, type EmailProvider } from "@kalayaan/core";

/**
 * Minimal shape of the Cloudflare Email Sending binding (`send_email`, env.EMAIL).
 * The workerd runtime supplies the real type; we depend only on the object-form
 * `send()`.
 */
export interface SendEmailBinding {
  send(message: {
    to: string | string[];
    from: { email: string; name?: string };
    subject: string;
    html: string;
    text: string;
    replyTo?: string;
  }): Promise<unknown>;
}

/** Default sender + reply-to applied when a message doesn't specify its own. */
export interface EmailDefaults {
  from: string;
  fromName?: string | null;
  replyTo?: string | null;
}

/**
 * EmailProvider backed by the Cloudflare Email Sending binding. The `from`
 * domain must be onboarded for Email Sending — `kalayaan deploy` does this
 * automatically (see `packages/cli/src/cf/email.ts`) — or sends fail with
 * `E_SENDER_NOT_VERIFIED`, surfaced here as an EdgeCMSError.
 */
export class CloudflareEmailProvider implements EmailProvider {
  constructor(
    private readonly binding: SendEmailBinding,
    private readonly defaults: EmailDefaults,
  ) {}

  async send(message: EmailMessage): Promise<void> {
    const from = message.from ?? { email: this.defaults.from, name: this.defaults.fromName ?? undefined };
    const replyTo = message.replyTo ?? this.defaults.replyTo ?? undefined;
    try {
      await this.binding.send({
        to: message.to,
        from: { email: from.email, ...(from.name && { name: from.name }) },
        subject: message.subject,
        html: message.html,
        text: message.text,
        ...(replyTo && { replyTo }),
      });
    } catch (err) {
      const code = (err as { code?: string })?.code;
      const detail = code ? ` (${code})` : "";
      throw new EdgeCMSError("internal", `Email send failed${detail}`);
    }
  }
}
