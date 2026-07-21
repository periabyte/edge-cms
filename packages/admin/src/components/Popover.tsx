import * as PopoverPrimitive from "@radix-ui/react-popover";
import { type ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Controlled popover anchored below-right of the point it's rendered at.
 * Backed by Radix's Popover primitive for real focus/escape/outside-click +
 * collision-aware positioning, while keeping the original controlled
 * `open`/`onClose` prop contract so existing callers don't need to change.
 */
export function Popover({
	open,
	onClose,
	children,
	className = "",
}: {
	open: boolean;
	onClose: () => void;
	children: ReactNode;
	className?: string;
}) {
	return (
		<PopoverPrimitive.Root
			open={open}
			onOpenChange={(next) => {
				if (!next) onClose();
			}}
		>
			<PopoverPrimitive.Anchor />
			<PopoverPrimitive.Portal>
				<PopoverPrimitive.Content
					side="bottom"
					align="end"
					sideOffset={8}
					onEscapeKeyDown={onClose}
					className={cn(
						"ecms-pop-in z-[180] bg-popover border border-border rounded-[10px] shadow-token-lg p-1.5 outline-none",
						className,
					)}
				>
					{children}
				</PopoverPrimitive.Content>
			</PopoverPrimitive.Portal>
		</PopoverPrimitive.Root>
	);
}
