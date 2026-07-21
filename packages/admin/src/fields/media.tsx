import { useState } from "react";
import { Button } from "../components/ui.js";
import { useMediaList, useUploadMedia } from "../lib/hooks.js";
import type { FieldEditorProps } from "./registry.js";

export function MediaField({ value, onChange }: FieldEditorProps) {
	const [open, setOpen] = useState(false);
	const { data: media } = useMediaList();
	const upload = useUploadMedia();
	const selected = media?.find((m) => m.id === value);

	return (
		<div className="space-y-2">
			<div className="flex items-center gap-2">
				{selected ? (
					<span className="truncate text-sm text-foreground">
						{selected.filename}
					</span>
				) : (
					<span className="text-sm text-subtle-foreground">
						No file selected
					</span>
				)}
				<Button
					type="button"
					variant="secondary"
					onClick={() => setOpen((o) => !o)}
				>
					{open ? "Close" : "Choose"}
				</Button>
				{value ? (
					<Button type="button" variant="ghost" onClick={() => onChange(null)}>
						Clear
					</Button>
				) : null}
			</div>

			{open && (
				<div className="max-h-48 space-y-1 overflow-y-auto rounded-lg border border-border p-2">
					<label className="block">
						<input
							type="file"
							className="text-xs"
							onChange={async (e) => {
								const file = e.target.files?.[0];
								if (!file) return;
								const { doc } = await upload.mutateAsync(file);
								onChange(doc.id);
								setOpen(false);
							}}
						/>
					</label>
					{media?.map((m) => (
						<button
							key={m.id}
							type="button"
							className="block w-full truncate rounded px-2 py-1 text-left text-sm hover:bg-accent"
							onClick={() => {
								onChange(m.id);
								setOpen(false);
							}}
						>
							{m.filename}
						</button>
					))}
				</div>
			)}
		</div>
	);
}
