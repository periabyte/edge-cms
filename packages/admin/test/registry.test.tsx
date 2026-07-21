import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { FieldEditor, FIELD_REGISTRY } from "../src/fields/registry.js";
import type { SchemaField } from "../src/lib/types.js";

function renderField(field: SchemaField, value: unknown, onChange: (v: unknown) => void) {
  const qc = new QueryClient();
  return render(
    <QueryClientProvider client={qc}>
      <FieldEditor field={field} value={value} onChange={onChange} />
    </QueryClientProvider>,
  );
}

describe("FIELD_REGISTRY", () => {
  it("has an editor for every field type", () => {
    const types = ["text", "slug", "richText", "media", "relation", "select", "number", "boolean", "date"];
    for (const type of types) expect(FIELD_REGISTRY).toHaveProperty(type);
  });
});

describe("text field", () => {
  it("renders the current value and calls onChange on input", () => {
    const onChange = vi.fn();
    renderField({ name: "title", type: "text" }, "Hello", onChange);
    const input = screen.getByDisplayValue("Hello") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "Hello World" } });
    expect(onChange).toHaveBeenCalledWith("Hello World");
  });
});

describe("slug field", () => {
  it("lowercases and strips invalid characters as the user types", () => {
    const onChange = vi.fn();
    renderField({ name: "slug", type: "slug", from: "title" }, "", onChange);
    const input = screen.getByPlaceholderText(/auto-generated/i);
    fireEvent.change(input, { target: { value: "Hello World!" } });
    expect(onChange).toHaveBeenCalledWith("hello-world-");
  });
});

describe("select field", () => {
  it("renders every configured option and reports the chosen one", () => {
    const onChange = vi.fn();
    renderField(
      { name: "status", type: "select", options: ["draft", "published"] },
      "draft",
      onChange,
    );
    const trigger = screen.getByRole("combobox");
    expect(trigger).toHaveTextContent("draft");
    fireEvent.click(trigger);
    expect(screen.getByRole("option", { name: "draft" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "published" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("option", { name: "published" }));
    expect(onChange).toHaveBeenCalledWith("published");
  });
});

describe("number field", () => {
  it("parses numeric input and reports undefined when cleared", () => {
    const onChange = vi.fn();
    renderField({ name: "views", type: "number" }, 3, onChange);
    const input = screen.getByDisplayValue("3");
    fireEvent.change(input, { target: { value: "7" } });
    expect(onChange).toHaveBeenCalledWith(7);
    fireEvent.change(input, { target: { value: "" } });
    expect(onChange).toHaveBeenCalledWith(undefined);
  });
});

describe("boolean field", () => {
  it("toggles a checkbox", () => {
    const onChange = vi.fn();
    renderField({ name: "featured", type: "boolean" }, false, onChange);
    fireEvent.click(screen.getByRole("checkbox"));
    expect(onChange).toHaveBeenCalledWith(true);
  });
});

describe("date field", () => {
  it("round-trips an epoch-ms value through the datetime-local input", () => {
    const onChange = vi.fn();
    const now = Date.UTC(2026, 0, 1, 12, 0, 0);
    const { container } = renderField({ name: "publishAt", type: "date" }, now, onChange);
    const input = container.querySelector('input[type="datetime-local"]') as HTMLInputElement;
    expect(input.value).not.toBe("");
    fireEvent.change(input, { target: { value: "" } });
    expect(onChange).toHaveBeenCalledWith(undefined);
  });
});
