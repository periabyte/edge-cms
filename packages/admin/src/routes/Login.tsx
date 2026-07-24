import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { ApiError } from "../lib/api.js";
import { useLogin, useSchema } from "../lib/hooks.js";
import { loginSchema, type LoginValues } from "../lib/schemas.js";
import { Button, Card, ErrorBanner, Input } from "../components/ui.js";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "../components/ui/form.js";

export function Login() {
  const login = useLogin();
  const { data: schema } = useSchema();
  const form = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-sm p-6">
        <div className="flex items-center gap-2.5 mb-5">
          <div className="w-8 h-8 rounded-lg bg-brand flex items-center justify-center text-brand-foreground font-bold shadow-token">
            {(schema?.name ?? "E").slice(0, 1).toUpperCase()}
          </div>
          <div>
            <div className="font-semibold text-sm">{schema?.name ?? "Kalayaan"}</div>
            <div className="text-[11px] text-muted-foreground">Sign in to continue</div>
          </div>
        </div>

        <Form {...form}>
          <form className="space-y-4" onSubmit={form.handleSubmit((values) => login.mutate(values))}>
            {login.isError && (
              <ErrorBanner message={login.error instanceof ApiError ? login.error.message : "Something went wrong"} />
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
            <Button type="submit" variant="default" className="w-full" disabled={login.isPending}>
              Sign in
            </Button>
          </form>
        </Form>
      </Card>
    </div>
  );
}
