# ADR 0002: Cloudflare Workers + Hono for the API, hexagonal structure

- Status: Accepted
- Date: 2026-10-05

## Context

The API must cost ₹0 until there are sales, have no servers to patch, and keep secrets (AI keys, Razorpay secret, Supabase service key) away from the browser. Business logic must survive swapping providers (AI, database, payments) without rewrites.

## Decision

- The API is a **Cloudflare Worker** using **Hono** (TypeScript).
- Code follows ports and adapters: `application/` depends only on `domain` and `ports/`. Adapters in `infrastructure/` implement the ports. Only `container.ts` wires adapters in.
- Middleware order: requestId → securityHeaders → CORS → bodyLimit → contentType → auth/Turnstile → rateLimit → route. Errors map to HTTP in one `app.onError` handler, so every response, including errors, gets CORS and security headers.

## Consequences

- Free tier limits apply: 100k requests/day and a 10 ms CPU limit per request (PRD-AMENDMENTS V-05). Waiting on `fetch` doesn't count toward CPU.
- In-memory adapters let the backend be built and tested before the database exists (Phase 2), and the same contract tests later run against the Supabase adapters.
- Webhook routes must read the raw body before anything parses it, so signature checks run over the exact bytes received.
