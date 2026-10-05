# ADR 0001: Astro (with React islands) for the website

- Status: Accepted
- Date: 2026-10-05

## Context

Security is the top priority, and the plan calls for a strict Content-Security-Policy with no `'unsafe-inline'` scripts. The site is mostly static marketing and tool pages, with a few interactive parts (upload, results, checkout). It's hosted free on Cloudflare Pages.

## Decision

Use **Astro** with React islands, Tailwind and shadcn/ui, deployed as static output to Cloudflare Pages.

## Consequences

- Astro generates hashes for its own scripts and styles, so a strict CSP works. A static Next.js export can't easily do this.
- Static HTML gives fast pages, good SEO and a small JS bundle.
- Astro puts its CSP in a `<meta>` tag. Directives that only work in headers (`frame-ancestors`) go in Pages `_headers`, and the two policies must not conflict (see PRD-AMENDMENTS AM-15).
- Interactive parts are React function components. Logic lives in classes and hooks in `packages/browser`.
