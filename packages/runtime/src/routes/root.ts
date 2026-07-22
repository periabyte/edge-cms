import type { Context, Handler } from "hono";
import type { ResolvedConfig } from "@edgecms/config";
import { notFound } from "../errors.js";

/**
 * `GET /` — the page a deployed Worker serves at its bare root, per
 * docs/design-handoff.md §15d. EdgeCMS is headless (every real request goes
 * to /api/v1, /api/graphql, /media, /admin/*, or /mcp), so an unmatched `/`
 * otherwise falls through to the generic JSON 404. Browser navigations get a
 * small self-contained HTML page instead; everything else keeps the existing
 * JSON 404 so tooling/health checks don't regress.
 */
export function homeRoute(config: ResolvedConfig): Handler {
  return (c: Context) => {
    const accept = c.req.header("Accept") ?? "";
    if (!accept.includes("text/html")) return notFound(c);

    const links: Array<{ label: string; href: string }> = [
      { label: "Admin", href: "/admin" },
      { label: "REST API", href: "/api/v1" },
    ];
    if (config.graphql) links.push({ label: "GraphQL", href: "/api/graphql" });
    links.push({ label: "MCP", href: "/mcp" });

    return c.html(renderHome(config.name, links));
  };
}

function renderHome(siteName: string, links: Array<{ label: string; href: string }>): string {
  const linkRows = links
    .map(
      (l) =>
        `<li><a href="${escapeHtml(l.href)}">${escapeHtml(l.label)}</a><span>${escapeHtml(l.href)}</span></li>`,
    )
    .join("");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(siteName)} — EdgeCMS API</title>
<style>
  :root { color-scheme: dark; --bg:#0D0E17; --text-1:#ECEDF3; --text-3:#7C8299; --border:#262A3B; --accent:#FF6A3D; }
  @media (prefers-color-scheme: light) {
    :root { color-scheme: light; --bg:#F8F8F5; --text-1:#14161F; --text-3:#6A6F80; --border:#E1E1D8; --accent:#E85D2A; }
  }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body {
    background: var(--bg); color: var(--text-1);
    font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
    display: flex; align-items: center; justify-content: center; min-height: 100vh; padding: 24px;
  }
  main { max-width: 420px; width: 100%; text-align: center; }
  .mark { width: 40px; height: 40px; margin: 0 auto 20px; }
  h1 {
    font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace;
    font-weight: 800; font-size: 20px; letter-spacing: -0.02em; margin: 0 0 6px;
  }
  p.sub { color: var(--text-3); font-size: 14px; margin: 0 0 28px; }
  ul { list-style: none; margin: 0 0 28px; padding: 0; border: 1px solid var(--border); border-radius: 10px; overflow: hidden; text-align: left; }
  li { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 12px 16px; border-bottom: 1px solid var(--border); }
  li:last-child { border-bottom: none; }
  a { color: var(--accent); text-decoration: none; font-weight: 600; font-size: 14px; }
  a:hover { text-decoration: underline; }
  li span { font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace; font-size: 12px; color: var(--text-3); }
  footer { font-size: 12px; color: var(--text-3); }
  footer a { color: var(--text-3); font-weight: 400; }
</style>
</head>
<body>
<main>
  <svg class="mark" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M24 76 L11 89" fill="none" stroke="#FF6A3D" stroke-width="4.2" stroke-linecap="round" opacity="0.9"/><circle cx="10" cy="90" r="3.4" fill="#FF6A3D"/><path d="M14 61 L34 91" fill="none" stroke="#FF7E56" stroke-width="4.6" stroke-linecap="round"/><path d="M18 66 L78 20 L90 14 L86 30 L30 88 Z" fill="rgba(255,106,61,0.14)"/><path d="M18 66 L78 20 L90 14" fill="none" stroke="rgba(255,106,61,0.45)" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"/><path d="M90 14 L86 30 L30 88" fill="none" stroke="#FF7E56" stroke-width="6" stroke-linejoin="round" stroke-linecap="round"/><circle cx="18" cy="66" r="3.6" fill="#FF7E56"/><circle cx="30" cy="88" r="4.6" fill="#FF6A3D"/><circle cx="90" cy="14" r="4.8" fill="#FF6A3D"/></svg>
  <h1>This is an EdgeCMS API.</h1>
  <p class="sub">${escapeHtml(siteName)}</p>
  <ul>${linkRows}</ul>
  <footer>powered by <a href="https://github.com/periabyte/edge-cms" target="_blank" rel="noopener">EdgeCMS</a></footer>
</main>
</body>
</html>`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
