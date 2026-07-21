/**
 * The email-sending capability seam. Runtime provides a Cloudflare-Email-backed
 * implementation; a future Resend plugin can supply an alternative. Kept in core
 * (not runtime) so the interface is a shared contract and no binding-specific
 * type leaks into unit tests. Mirrors {@link AIProvider}.
 */

export interface EmailAddress {
  email: string;
  name?: string;
}

export interface EmailMessage {
  to: string | string[];
  subject: string;
  html: string;
  text: string;
  /** Overrides the provider's default sender when set. */
  from?: EmailAddress;
  replyTo?: string;
}

export interface EmailProvider {
  /** Send a transactional email. Rejects if the provider can't deliver it. */
  send(message: EmailMessage): Promise<void>;
}
