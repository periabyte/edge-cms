import type { Context, ErrorHandler } from "hono";
import { EdgeCMSError } from "@kalayaan/core";
import { ZodError } from "zod";

export const errorHandler: ErrorHandler = (err, c: Context) => {
  if (err instanceof EdgeCMSError) {
    return c.json(err.toBody(), err.status as 400);
  }
  if (err instanceof ZodError) {
    const validationError = new EdgeCMSError(
      "validation_failed",
      "Request body failed validation",
      err.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
    );
    return c.json(validationError.toBody(), 422);
  }
  console.error(err);
  return c.json(new EdgeCMSError("internal", "Internal server error").toBody(), 500);
};

export function notFound(c: Context) {
  return c.json(new EdgeCMSError("not_found", `No route: ${c.req.method} ${c.req.path}`).toBody(), 404);
}
