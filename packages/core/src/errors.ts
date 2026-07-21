export type ErrorCode =
  | "validation_failed"
  | "not_found"
  | "unauthorized"
  | "forbidden"
  | "conflict"
  | "rate_limited"
  | "bad_request"
  | "internal";

const STATUS: Record<ErrorCode, number> = {
  validation_failed: 422,
  not_found: 404,
  unauthorized: 401,
  forbidden: 403,
  conflict: 409,
  rate_limited: 429,
  bad_request: 400,
  internal: 500,
};

export interface ErrorDetail {
  path: string;
  message: string;
}

export class EdgeCMSError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly details: ErrorDetail[] | undefined;

  constructor(code: ErrorCode, message: string, details?: ErrorDetail[]) {
    super(message);
    this.name = "EdgeCMSError";
    this.code = code;
    this.status = STATUS[code];
    this.details = details;
  }

  toBody(): { error: { code: ErrorCode; message: string; details?: ErrorDetail[] } } {
    return {
      error: { code: this.code, message: this.message, ...(this.details && { details: this.details }) },
    };
  }
}
