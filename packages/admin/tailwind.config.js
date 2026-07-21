import tailwindcssAnimate from "tailwindcss-animate";

/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      // Map Tailwind color utilities onto the CSS-variable token layer in
      // index.css so `bg-card`, `text-muted`, `border-border`, etc. follow the
      // active theme. Token values are bare HSL channel triplets ("H S% L%"),
      // consumed here as `hsl(var(--x) / <alpha-value>)` so opacity modifiers
      // (e.g. `bg-brand/50`) work. Use color-mix in raw CSS where translucency
      // outside Tailwind's opacity syntax is required.
      colors: {
        background: "hsl(var(--background) / <alpha-value>)",
        foreground: "hsl(var(--foreground) / <alpha-value>)",
        card: "hsl(var(--card) / <alpha-value>)",
        "card-2": "hsl(var(--card-2) / <alpha-value>)",
        popover: "hsl(var(--popover) / <alpha-value>)",
        "popover-foreground": "hsl(var(--popover-foreground) / <alpha-value>)",
        muted: "hsl(var(--muted) / <alpha-value>)",
        "muted-foreground": "hsl(var(--muted-foreground) / <alpha-value>)",
        "subtle-foreground": "hsl(var(--subtle-foreground) / <alpha-value>)",
        accent: "hsl(var(--accent) / <alpha-value>)",
        "accent-hover": "hsl(var(--accent-hover) / <alpha-value>)",
        "accent-foreground": "hsl(var(--accent-foreground) / <alpha-value>)",
        border: "hsl(var(--border) / <alpha-value>)",
        "border-strong": "hsl(var(--border-strong) / <alpha-value>)",
        input: "hsl(var(--input) / <alpha-value>)",
        ring: "hsl(var(--ring) / <alpha-value>)",
        brand: "hsl(var(--brand) / <alpha-value>)",
        "brand-hover": "hsl(var(--brand-hover) / <alpha-value>)",
        "brand-foreground": "hsl(var(--brand-foreground) / <alpha-value>)",
        "brand-subtle": "hsl(var(--brand-subtle) / <alpha-value>)",
        "brand-subtle-fg": "hsl(var(--brand-subtle-fg) / <alpha-value>)",
        draft: "hsl(var(--draft) / <alpha-value>)",
        "draft-subtle": "hsl(var(--draft-subtle) / <alpha-value>)",
        "draft-fg": "hsl(var(--draft-fg) / <alpha-value>)",
        published: "hsl(var(--published) / <alpha-value>)",
        "published-subtle": "hsl(var(--published-subtle) / <alpha-value>)",
        "published-fg": "hsl(var(--published-fg) / <alpha-value>)",
        danger: "hsl(var(--danger) / <alpha-value>)",
        "danger-subtle": "hsl(var(--danger-subtle) / <alpha-value>)",
        "danger-fg": "hsl(var(--danger-fg) / <alpha-value>)",
        mt: "hsl(var(--mt) / <alpha-value>)",
        "mt-subtle": "hsl(var(--mt-subtle) / <alpha-value>)",
        "mt-fg": "hsl(var(--mt-fg) / <alpha-value>)",
        // shadcn/ui convention aliases — let stock shadcn components render
        // unmodified; prefer the semantic names above in app code.
        primary: {
          DEFAULT: "hsl(var(--primary) / <alpha-value>)",
          foreground: "hsl(var(--primary-foreground) / <alpha-value>)",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary) / <alpha-value>)",
          foreground: "hsl(var(--secondary-foreground) / <alpha-value>)",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive) / <alpha-value>)",
          foreground: "hsl(var(--destructive-foreground) / <alpha-value>)",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      boxShadow: {
        token: "var(--shadow)",
        "token-lg": "var(--shadow-lg)",
      },
      fontFamily: {
        sans: ["Geist", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["Geist Mono", "ui-monospace", "monospace"],
      },
    },
  },
  plugins: [tailwindcssAnimate],
};
