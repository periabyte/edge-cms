import {
	createContext,
	type ReactNode,
	useCallback,
	useContext,
	useEffect,
	useState,
} from "react";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "./ui/alert-dialog.js";
import { buttonVariants } from "./ui/button.js";
import { Input } from "./ui.js";
import { cn } from "@/lib/utils";

export interface ConfirmConfig {
	title: string;
	message: string;
	confirmLabel?: string;
	/** When set, the user must type this exact string to enable the confirm button. */
	typeToConfirm?: string;
	danger?: boolean;
	onConfirm: () => void;
}

/** Modal confirmation, optionally gated on typing an exact phrase (destructive actions). */
export function ConfirmDialog({
	config,
	onClose,
}: {
	config: ConfirmConfig | null;
	onClose: () => void;
}) {
	const [typed, setTyped] = useState("");

	useEffect(() => {
		setTyped("");
	}, [config]);

	const gated = config?.typeToConfirm !== undefined;
	const canConfirm = !gated || typed === config?.typeToConfirm;

	return (
		<AlertDialog
			open={config !== null}
			onOpenChange={(open) => {
				if (!open) onClose();
			}}
		>
			<AlertDialogContent className="max-w-md">
				{config && (
					<>
						<AlertDialogHeader>
							<AlertDialogTitle>{config.title}</AlertDialogTitle>
							<AlertDialogDescription>{config.message}</AlertDialogDescription>
						</AlertDialogHeader>
						{gated && (
							<div>
								<label className="block text-[12.5px] text-muted-foreground mb-1.5">
									Type{" "}
									<span className="font-mono text-foreground">
										{config.typeToConfirm}
									</span>{" "}
									to confirm
								</label>
								<Input
									value={typed}
									onChange={(e) => setTyped(e.target.value)}
									autoFocus
								/>
							</div>
						)}
						<AlertDialogFooter>
							<AlertDialogCancel>Cancel</AlertDialogCancel>
							<AlertDialogAction
								disabled={!canConfirm}
								className={cn(
									config.danger &&
										buttonVariants({ variant: "destructive" }),
								)}
								onClick={() => {
									config.onConfirm();
								}}
							>
								{config.confirmLabel ?? "Confirm"}
							</AlertDialogAction>
						</AlertDialogFooter>
					</>
				)}
			</AlertDialogContent>
		</AlertDialog>
	);
}

const ConfirmContext = createContext<((config: ConfirmConfig) => void) | null>(
	null,
);

/** Provides a global `useConfirm()` so any view can raise the modal. */
export function ConfirmProvider({ children }: { children: ReactNode }) {
	const [config, setConfig] = useState<ConfirmConfig | null>(null);
	const confirm = useCallback((c: ConfirmConfig) => setConfig(c), []);
	return (
		<ConfirmContext.Provider value={confirm}>
			{children}
			<ConfirmDialog config={config} onClose={() => setConfig(null)} />
		</ConfirmContext.Provider>
	);
}

export function useConfirm() {
	const ctx = useContext(ConfirmContext);
	if (!ctx) throw new Error("useConfirm must be used within ConfirmProvider");
	return ctx;
}
