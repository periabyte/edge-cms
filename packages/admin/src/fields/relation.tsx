import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Plus, X } from "lucide-react";
import type { FieldDef } from "@kalayaan/config";
import { useCreateDoc, useRelationOptions, useSchema } from "../lib/hooks.js";
import { ApiError } from "../lib/api.js";
import { cn } from "../components/ui.js";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select.js";
import type { Doc, SchemaCollection } from "../lib/types.js";
import type { FieldEditorProps } from "./registry.js";

/**
 * Relation editor. Many-relations get a searchable multi-select "tag cloud"
 * (shadcn combobox pattern): selected values render as removable pills, typing
 * filters the target collection, and an unmatched query can create a new entry
 * inline. Single relations use the shadcn `Select`.
 */
export function RelationField({ field, value, onChange }: FieldEditorProps) {
  const def = field as unknown as Extract<FieldDef, { type: "relation" }>;
  const { data: schema } = useSchema();
  const { data: page, isLoading } = useRelationOptions(def.to);
  const target = schema?.collections.find((c) => c.name === def.to);

  if (def.many) {
    return (
      <TagMultiSelect
        target={def.to}
        targetSchema={target}
        options={page?.docs ?? []}
        loading={isLoading}
        value={(value as string[] | undefined) ?? []}
        onChange={onChange}
      />
    );
  }

  const labelOf = (id: string) => labelFrom(page?.docs.find((d) => d.id === id), target, id);
  return (
    <Select
      value={(value as string) ?? "__none"}
      disabled={isLoading}
      onValueChange={(v) => onChange(v === "__none" ? null : v)}
    >
      <SelectTrigger>
        <SelectValue placeholder="None" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="__none">None</SelectItem>
        {page?.docs.map((doc) => (
          <SelectItem key={doc.id} value={doc.id}>
            {labelOf(doc.id)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function labelFrom(doc: Doc | undefined, target: SchemaCollection | undefined, id: string): string {
  if (!doc) return id;
  const titleField = target?.titleField;
  return titleField ? String(doc[titleField] ?? id) : id;
}

/** Field the "create new" flow writes the typed text into (title, else first text field). */
function writeField(target: SchemaCollection | undefined): string | null {
  if (!target) return null;
  return target.titleField ?? target.fields.find((f) => f.type === "text")?.name ?? null;
}

function TagMultiSelect({
  target,
  targetSchema,
  options,
  loading,
  value,
  onChange,
}: {
  target: string;
  targetSchema: SchemaCollection | undefined;
  options: Doc[];
  loading: boolean;
  value: string[];
  onChange: (ids: string[]) => void;
}) {
  const create = useCreateDoc(target);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  // Labels for entries created this session, shown on their pills before the
  // options list refetches.
  const [localLabels, setLocalLabels] = useState<Record<string, string>>({});
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selected = new Set(value);
  const field = writeField(targetSchema);
  const labelOf = (id: string) => localLabels[id] ?? labelFrom(options.find((d) => d.id === id), targetSchema, id);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    return options
      .filter((d) => !selected.has(d.id))
      .filter((d) => !q || labelFrom(d, targetSchema, d.id).toLowerCase().includes(q))
      .slice(0, 50);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [options, query, targetSchema, value]);

  const exact = useMemo(
    () => options.some((d) => labelFrom(d, targetSchema, d.id).toLowerCase() === query.trim().toLowerCase()),
    [options, query, targetSchema],
  );
  const canCreate = Boolean(query.trim()) && !exact && Boolean(field);
  const rows = matches.length + (canCreate ? 1 : 0);

  useEffect(() => setActive(0), [query]);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const add = (id: string) => {
    if (!selected.has(id)) onChange([...value, id]);
    setQuery("");
    inputRef.current?.focus();
  };
  const remove = (id: string) => onChange(value.filter((v) => v !== id));

  const createTag = async () => {
    if (!field) return;
    const name = query.trim();
    // Publish immediately: the picker has no separate publish step of its own,
    // so a tag/relation created inline here would otherwise sit as an invisible
    // draft — never shown on the public content API — even once the entry
    // referencing it is published. Fall back to a plain (draft) create if the
    // user's role can't publish this target collection, rather than blocking
    // tag creation outright.
    let created: Doc;
    try {
      created = await create.mutateAsync({ body: { [field]: name, published_at: Date.now() } });
    } catch (e) {
      if (!(e instanceof ApiError) || e.status !== 403) throw e;
      created = await create.mutateAsync({ body: { [field]: name } });
    }
    setLocalLabels((m) => ({ ...m, [created.id]: name }));
    add(created.id);
  };

  const choose = (index: number) => {
    if (index < matches.length) add(matches[index]!.id);
    else if (canCreate) void createTag();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, Math.max(rows - 1, 0)));
      setOpen(true);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (rows > 0) choose(active);
    } else if (e.key === "Backspace" && query === "" && value.length) {
      remove(value[value.length - 1]!);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  return (
    <div ref={rootRef} className="relative">
      <div
        onClick={() => {
          setOpen(true);
          inputRef.current?.focus();
        }}
        className="min-h-10 flex flex-wrap items-center gap-1.5 rounded-lg border border-input bg-card px-2 py-1.5 cursor-text focus-within:border-brand"
      >
        {value.map((id) => (
          <span
            key={id}
            className="inline-flex items-center gap-1 h-6 pl-2 pr-1 rounded-full bg-brand-subtle text-brand-subtle-fg text-[12.5px] font-medium"
          >
            {labelOf(id)}
            <button
              type="button"
              title="Remove"
              onClick={(e) => {
                e.stopPropagation();
                remove(id);
              }}
              className="w-4 h-4 flex items-center justify-center rounded-full hover:bg-black/10"
            >
              <X size={11} />
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          value={query}
          disabled={loading}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder={value.length ? "" : loading ? "Loading…" : "Search or add…"}
          className="flex-1 min-w-[90px] h-6 bg-transparent outline-none text-[13.5px] text-foreground placeholder:text-subtle-foreground"
        />
      </div>

      {open && (matches.length > 0 || canCreate) && (
        <div className="absolute z-30 mt-1 w-full max-h-56 overflow-y-auto bg-popover border border-border rounded-[10px] shadow-token-lg p-1">
          {matches.map((doc, i) => (
            <button
              key={doc.id}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => add(doc.id)}
              onMouseEnter={() => setActive(i)}
              className={cn(
                "w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md text-[13px] text-left",
                active === i ? "bg-accent text-foreground" : "text-muted-foreground",
              )}
            >
              <Check size={13} className="opacity-0" />
              <span className="flex-1 truncate">{labelFrom(doc, targetSchema, doc.id)}</span>
            </button>
          ))}
          {canCreate && (
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => void createTag()}
              onMouseEnter={() => setActive(matches.length)}
              disabled={create.isPending}
              className={cn(
                "w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md text-[13px] text-left disabled:opacity-60",
                active === matches.length ? "bg-accent text-foreground" : "text-muted-foreground",
              )}
            >
              <Plus size={13} className="text-brand-subtle-fg" />
              <span className="flex-1 truncate">{create.isPending ? "Creating…" : `Create “${query.trim()}”`}</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
