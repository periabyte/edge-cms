import {
	FileText,
	Image,
	Moon,
	Send,
	Settings,
	Sun,
} from "lucide-react";
import { type ReactNode, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useSchema } from "../lib/hooks.js";
import { useTheme } from "../lib/theme.js";
import {
	CommandDialog,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
} from "./ui/command.js";

interface Command {
	group: "Actions" | "Collections" | "Go to";
	label: string;
	icon: ReactNode;
	run: () => void;
}

export function CommandPalette({
	open,
	onClose,
}: {
	open: boolean;
	onClose: () => void;
}) {
	const { data: schema } = useSchema();
	const navigate = useNavigate();
	const { theme, toggle } = useTheme();

	const commands = useMemo<Command[]>(() => {
		const go = (path: string) => () => {
			navigate(path);
			onClose();
		};
		const cmds: Command[] = [];
		for (const c of schema?.collections ?? [])
			cmds.push({
				group: "Collections",
				label: `Open ${c.name}`,
				icon: <FileText size={15} />,
				run: go(`/${c.name}`),
			});
		const firstCollection = schema?.collections[0]?.name;
		if (firstCollection)
			cmds.push({
				group: "Actions",
				label: "Create new entry",
				icon: <Send size={15} />,
				run: go(`/${firstCollection}/new`),
			});
		cmds.push({
			group: "Actions",
			label: "Toggle theme",
			icon: theme === "dark" ? <Sun size={15} /> : <Moon size={15} />,
			run: () => {
				toggle();
				onClose();
			},
		});
		cmds.push({
			group: "Go to",
			label: "Media library",
			icon: <Image size={15} />,
			run: go("/media"),
		});
		cmds.push({
			group: "Go to",
			label: "Settings",
			icon: <Settings size={15} />,
			run: go("/settings"),
		});
		return cmds;
	}, [schema, navigate, onClose, theme, toggle]);

	const groups = ["Actions", "Collections", "Go to"] as const;

	return (
		<CommandDialog
			open={open}
			onOpenChange={(o) => {
				if (!o) onClose();
			}}
		>
			<CommandInput placeholder="Search or jump to…" />
			<CommandList>
				<CommandEmpty>No matches</CommandEmpty>
				{groups.map((g) => {
					const items = commands.filter((c) => c.group === g);
					if (!items.length) return null;
					return (
						<CommandGroup key={g} heading={g}>
							{items.map((c) => (
								<CommandItem
									key={c.label}
									value={c.label}
									onSelect={c.run}
								>
									<span className="text-muted-foreground">{c.icon}</span>
									{c.label}
								</CommandItem>
							))}
						</CommandGroup>
					);
				})}
			</CommandList>
		</CommandDialog>
	);
}
