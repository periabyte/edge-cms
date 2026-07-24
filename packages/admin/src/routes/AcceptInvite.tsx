import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { Button, Card, ErrorBanner, Input } from "../components/ui.js";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "../components/ui/form.js";
import { ApiError } from "../lib/api.js";
import { useAcceptInvite, useSchema } from "../lib/hooks.js";
import { passwordSetupSchema, type AcceptInviteValues } from "../lib/schemas.js";

/**
 * Public accept-invite screen (reached at /admin/accept?token=…). The invited
 * user sets their own password; on success a session is created and App
 * re-renders into the authenticated app.
 */
export function AcceptInvite() {
	const { data: schema } = useSchema();
	const accept = useAcceptInvite();
	const form = useForm<AcceptInviteValues>({
		resolver: zodResolver(passwordSetupSchema),
		defaultValues: { password: "", confirm: "" },
	});

	const token = new URLSearchParams(window.location.search).get("token") ?? "";

	return (
		<div className="flex min-h-screen items-center justify-center bg-background p-4">
			<Card className="w-full max-w-sm p-6">
				<div className="flex items-center gap-2.5 mb-5">
					<div className="w-8 h-8 rounded-lg bg-brand flex items-center justify-center text-brand-foreground font-display font-bold shadow-token">
						{(schema?.name ?? "K").slice(0, 1).toUpperCase()}
					</div>
					<div>
						<div className="font-semibold text-sm">
							{schema?.name ?? "Kalayaan"}
						</div>
						<div className="text-[11px] text-muted-foreground">
							Set your password
						</div>
					</div>
				</div>

				{!token ? (
					<ErrorBanner message="This invite link is missing its token." />
				) : (
					<Form {...form}>
						<form
							className="space-y-4"
							onSubmit={form.handleSubmit(({ password }) => accept.mutate({ token, password }))}
						>
							{accept.isError && (
								<ErrorBanner
									message={
										accept.error instanceof ApiError
											? accept.error.message
											: "Something went wrong"
									}
								/>
							)}
							<FormField
								control={form.control}
								name="password"
								render={({ field }) => (
									<FormItem>
										<FormLabel>New password</FormLabel>
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
							<Button
								type="submit"
								variant="default"
								className="w-full"
								disabled={accept.isPending}
							>
								Set password &amp; sign in
							</Button>
						</form>
					</Form>
				)}
			</Card>
		</div>
	);
}
