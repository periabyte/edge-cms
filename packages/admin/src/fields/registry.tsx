import { useState } from "react";
import type { ComponentType } from "react";
import type { FieldDef } from "@edgecms/config";
import type { SchemaField } from "../lib/types.js";
import { Input, Select, Textarea } from "../components/ui.js";
import {
  Select as RadixSelect,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select.js";
import { RichTextField } from "./rich-text.js";
import { MediaField } from "./media.js";
import { RelationField } from "./relation.js";

export interface FieldEditorProps {
  field: SchemaField;
  value: unknown;
  onChange: (value: unknown) => void;
}

function TextField({ field, value, onChange }: FieldEditorProps) {
  const def = field as unknown as Extract<FieldDef, { type: "text" }>;
  return (
    <Input
      value={(value as string) ?? ""}
      maxLength={def.maxLength}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

function SlugField({ value, onChange }: FieldEditorProps) {
  return (
    <Input
      value={(value as string) ?? ""}
      placeholder="auto-generated-from-title"
      onChange={(e) => onChange(e.target.value.toLowerCase().replace(/[^a-z0-9-]+/g, "-"))}
    />
  );
}

function SelectFieldEditor({ field, value, onChange }: FieldEditorProps) {
  const def = field as unknown as Extract<FieldDef, { type: "select" }>;
  return (
    <RadixSelect
      value={(value as string) ?? undefined}
      onValueChange={(v) => onChange(v)}
    >
      <SelectTrigger>
        <SelectValue placeholder="Choose…" />
      </SelectTrigger>
      <SelectContent>
        {def.options.map((opt) => (
          <SelectItem key={opt} value={opt}>
            {opt}
          </SelectItem>
        ))}
      </SelectContent>
    </RadixSelect>
  );
}

function NumberField({ value, onChange }: FieldEditorProps) {
  return (
    <Input
      type="number"
      value={value === null || value === undefined ? "" : String(value)}
      onChange={(e) => onChange(e.target.value === "" ? undefined : Number(e.target.value))}
    />
  );
}

function BooleanField({ value, onChange }: FieldEditorProps) {
  return (
    <input
      type="checkbox"
      className="h-4 w-4 rounded border-slate-300"
      checked={Boolean(value)}
      onChange={(e) => onChange(e.target.checked)}
    />
  );
}

function DateField({ value, onChange }: FieldEditorProps) {
  const local = value ? toLocalInput(value as number) : "";
  return (
    <Input
      type="datetime-local"
      value={local}
      onChange={(e) => onChange(e.target.value ? new Date(e.target.value).getTime() : undefined)}
    />
  );
}

function toLocalInput(epochMs: number): string {
  const d = new Date(epochMs - new Date().getTimezoneOffset() * 60_000);
  return d.toISOString().slice(0, 16);
}

/**
 * Editor for a plugin-contributed custom field type. A prebuilt admin bundle
 * can't load a plugin's own React component, so the field's `control` hint
 * picks one of the built-in widgets; the value is JSON-serializable and the
 * server's plugin validator enforces its real shape on save.
 */
function CustomFieldEditor({ field, value, onChange }: FieldEditorProps) {
  const control = (field.control as string | undefined) ?? "textarea";
  const options = (field.options as string[] | undefined) ?? [];
  switch (control) {
    case "text":
      return <Input value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value)} />;
    case "number":
      return (
        <Input
          type="number"
          value={value === null || value === undefined ? "" : String(value)}
          onChange={(e) => onChange(e.target.value === "" ? undefined : Number(e.target.value))}
        />
      );
    case "boolean":
      return (
        <input
          type="checkbox"
          className="h-4 w-4 rounded border-slate-300"
          checked={Boolean(value)}
          onChange={(e) => onChange(e.target.checked)}
        />
      );
    case "select":
      return (
        <Select value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value)}>
          <option value="" disabled>
            Choose…
          </option>
          {options.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </Select>
      );
    case "json":
      return <JsonField value={value} onChange={onChange} />;
    default:
      return (
        <Textarea
          value={typeof value === "string" ? value : value == null ? "" : JSON.stringify(value)}
          onChange={(e) => onChange(e.target.value)}
        />
      );
  }
}

/** A textarea that parses JSON on change and shows an inline invalid-JSON hint. */
function JsonField({ value, onChange }: { value: unknown; onChange: (v: unknown) => void }) {
  const [text, setText] = useState(() =>
    value === undefined ? "" : typeof value === "string" ? value : JSON.stringify(value, null, 2),
  );
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="flex flex-col gap-1">
      <Textarea
        value={text}
        className="font-mono text-[12.5px]"
        onChange={(e) => {
          const next = e.target.value;
          setText(next);
          if (next.trim() === "") {
            setError(null);
            onChange(undefined);
            return;
          }
          try {
            onChange(JSON.parse(next));
            setError(null);
          } catch {
            setError("Invalid JSON");
          }
        }}
      />
      {error && <span className="text-[11px] text-danger">{error}</span>}
    </div>
  );
}

/** Fallback for a field type without a matching UI (surfaces the gap instead of crashing). */
function UnknownField({ field }: FieldEditorProps) {
  return <Textarea disabled value={`Unsupported field type: ${field.type}`} />;
}

export const FIELD_REGISTRY: Record<FieldDef["type"], ComponentType<FieldEditorProps>> = {
  text: TextField,
  slug: SlugField,
  richText: RichTextField,
  media: MediaField,
  relation: RelationField,
  select: SelectFieldEditor,
  number: NumberField,
  boolean: BooleanField,
  date: DateField,
  custom: CustomFieldEditor,
};

export function FieldEditor(props: FieldEditorProps) {
  const Component = FIELD_REGISTRY[props.field.type] ?? UnknownField;
  return <Component {...props} />;
}
