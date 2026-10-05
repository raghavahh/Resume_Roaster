# ADR 0003: Supabase with a locked-down schema; Google-only login

- Status: Accepted
- Date: 2026-10-05

## Context

We need auth and a Postgres database for free. Supabase's public (publishable) key ships to every browser, so the database must stay safe even if someone calls the Supabase REST API directly with it. Storing passwords means a password leak is possible.

## Decision

- **Auth:** Supabase Auth with **Google login only**. Anonymous sign-ins off, exact redirect allowlist, PKCE, 1-hour JWTs, refresh-token rotation. The browser uses Supabase **only to log in**.
- **Data:** all tables live in schema `app`, which is **not** exposed to the Data API. RLS is on with no policies for `anon`/`authenticated` (deny all). Grants are revoked.
- **Access:** only through `SECURITY DEFINER` functions with `search_path = ''`, executable **only** by `service_role`. The service key exists only as a Worker secret.
- **Two projects:** `dev` and `prod`, which is the free plan's active-project limit. All three products share them.

## Consequences

- No passwords stored means no password leaks.
- The public key can log in and nothing else (attack tests S-18, S-19).
- The Worker verifies JWTs with JWKS, which requires asymmetric signing keys (PRD-AMENDMENTS V-01).
- Deleting an account doesn't invalidate JWTs already issued, so authenticated requests also check the profile exists (AM-11).
