import { CheckCircle2, Info, Trash2 } from "lucide-react";
import { createContext, type ReactNode, useCallback, useContext } from "react";
import { toast as sonnerToast } from "sonner";
import { Toaster } from "./ui/sonner.js";

type ToastKind = "published" | "info" | "danger";

interface ToastInput {
	title: string;
	desc?: string | undefined;
	kind?: ToastKind | undefined;
	duration?: number | undefined;
	onUndo?: (() => void) | undefined;
}

const ICONS: Record<ToastKind, ReactNode> = {
	published: <CheckCircle2 size={20} className="text-published" />,
	info: <Info size={20} className="text-brand" />,
	danger: <Trash2 size={20} className="text-danger" />,
};

const ToastContext = createContext<{
	toast: (input: ToastInput) => void;
} | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
	const toast = useCallback((input: ToastInput) => {
		const kind = input.kind ?? "info";
		const duration = input.duration ?? (input.onUndo ? 6000 : 3500);
		sonnerToast(input.title, {
			description: input.desc,
			duration,
			icon: ICONS[kind],
			action: input.onUndo
				? {
						label: "Undo",
						onClick: () => input.onUndo?.(),
					}
				: undefined,
		});
	}, []);

	return (
		<ToastContext.Provider value={{ toast }}>
			{children}
			<Toaster position="bottom-right" />
		</ToastContext.Provider>
	);
}

export function useToast() {
	const ctx = useContext(ToastContext);
	if (!ctx) throw new Error("useToast must be used within ToastProvider");
	return ctx.toast;
}
