import type {
  BooleanField,
  CustomField,
  DateField,
  MediaField,
  NumberField,
  RelationField,
  RichTextField,
  SelectField,
  SlugField,
  TextField,
} from "./types.js";

export const field = {
  text(opts: Omit<TextField, "type"> = {}): TextField {
    return { type: "text", ...opts };
  },
  slug(opts: Omit<SlugField, "type">): SlugField {
    return { type: "slug", unique: true, ...opts };
  },
  richText(opts: Omit<RichTextField, "type"> = {}): RichTextField {
    return { type: "richText", ...opts };
  },
  media(opts: Omit<MediaField, "type"> = {}): MediaField {
    return { type: "media", ...opts };
  },
  relation(to: string, opts: Omit<RelationField, "type" | "to"> = {}): RelationField {
    return { type: "relation", to, onDelete: "restrict", ...opts };
  },
  select(
    options: readonly string[],
    opts: Omit<SelectField, "type" | "options"> = {},
  ): SelectField {
    return { type: "select", options, ...opts };
  },
  number(opts: Omit<NumberField, "type"> = {}): NumberField {
    return { type: "number", ...opts };
  },
  boolean(opts: Omit<BooleanField, "type"> = {}): BooleanField {
    return { type: "boolean", ...opts };
  },
  date(opts: Omit<DateField, "type"> = {}): DateField {
    return { type: "date", ...opts };
  },
  custom(
    fieldType: string,
    opts: Omit<CustomField, "type" | "fieldType"> = {},
  ): CustomField {
    return { type: "custom", fieldType, ...opts };
  },
};
