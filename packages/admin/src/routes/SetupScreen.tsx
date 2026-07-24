import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { ApiError } from "../lib/api.js";
import { useSetup, useSchema } from "../lib/hooks.js";
import { setupSchema, type SetupValues } from "../lib/schemas.js";
import { Button, Card, ErrorBanner, Input } from "../components/ui.js";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "../components/ui/form.js";

/**
 * One-time first-run screen: shown by App when the deployment has no admin yet
 * (see useNeedsSetup). Creates the root administrator, after which the account
 * exists and every later visit gets the Login screen instead.
 */
export function SetupScreen() {
  const setup = useSetup();
  const { data: schema } = useSchema();
  const form = useForm<SetupValues>({
    resolver: zodResolver(setupSchema),
    defaultValues: { email: "", password: "", confirm: "" },
  });

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-sm p-6">
        <div className="flex items-center gap-2.5 mb-1">
          <div className="w-8 h-8 rounded-lg bg-brand flex items-center justify-center text-brand-foreground font-display font-bold shadow-token">
            {(schema?.name ?? "K").slice(0, 1).toUpperCase()}
          </div>
          <div>
            <div className="font-semibold text-sm">Welcome to {schema?.name ?? "Kalayaan"}</div>
            <div className="text-[11px] text-muted-foreground">Create your first administrator</div>
          </div>
        </div>
        <p className="text-[12px] text-muted-foreground mb-5 mt-3">
          This one-time step creates the root admin for this deployment. Choose credentials you'll use to sign in.
        </p>

        <Form {...form}>
          <form
            className="space-y-4"
            onSubmit={form.handleSubmit(({ email, password }) => setup.mutate({ email, password }))}
          >
            {setup.isError && (
              <ErrorBanner message={setup.error instanceof ApiError ? setup.error.message : "Something went wrong"} />
            )}
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Email</FormLabel>
                  <FormControl>
                    <Input type="email" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="password"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Password</FormLabel>
                  <FormControl>
                    <Input type="password" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="confirm"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Confirm password</FormLabel>
                  <FormControl>
                    <Input type="password" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <Button type="submit" variant="default" className="w-full" disabled={setup.isPending}>
              {setup.isPending ? "Creating…" : "Create administrator"}
            </Button>
          </form>
        </Form>
      </Card>
    </div>
  );
}
