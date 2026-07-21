import { z } from "zod";

/**
 * Shared password + confirm pair used by SetupScreen (root admin creation)
 * and AcceptInvite (invited user sets their password). `.refine` routes the
 * mismatch error onto the `confirm` field so it renders via that field's
 * <FormMessage />.
 */
export const passwordSetupSchema = z
  .object({
    password: z.string().min(8, "Password must be at least 8 characters"),
    confirm: z.string(),
  })
  .refine((d) => d.password === d.confirm, {
    message: "Passwords don't match",
    path: ["confirm"],
  });

export const loginSchema = z.object({
  email: z.string().email("Enter a valid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});
export type LoginValues = z.infer<typeof loginSchema>;

export const setupSchema = z
  .object({
    email: z.string().email("Enter a valid email address"),
    password: z.string().min(8, "Password must be at least 8 characters"),
    confirm: z.string(),
  })
  .refine((d) => d.password === d.confirm, {
    message: "Passwords don't match",
    path: ["confirm"],
  });
export type SetupValues = z.infer<typeof setupSchema>;

export type AcceptInviteValues = z.infer<typeof passwordSetupSchema>;

export const savedFilterNameSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
});
export type SavedFilterNameValues = z.infer<typeof savedFilterNameSchema>;
