# PRD amendments

`docs/PRD.md` is the original plan, kept unchanged. Where this file disagrees with it, **this file wins**. Each item says what changed and why.

| Status       | Meaning                                                                                  |
| ------------ | ---------------------------------------------------------------------------------------- |
| **Decided**  | Applies now                                                                              |
| **Proposed** | Recommended; needs the owner's confirmation before the phase that uses it                |
| **Verify**   | An external fact to check against current docs before coding the part that depends on it |

## Decided

### AM-01: 30-day passes instead of subscriptions in v1 (ADR 0004)

- v1 sells the free tier, **Quick Fix ₹99** and **one-time 30-day passes** (exact passes and limits are set in `Catalog` during the contract step).
- A pass is a `one_time_credit` grant with an `expires_at`. It reuses `grant_pack()`, the Orders API and the existing payment verification flow.
- Out of v1: Razorpay Subscriptions, mandates, the subscription state machine, `BillingReconciler`, upgrade/downgrade, per-period refunds, and tests F-17 to F-24 and S-SUB-01 to S-SUB-19. They move to v1.1, once people have shown they'll pay.
- Consumption priority becomes: the soonest-expiring credit first, then the oldest, then the free daily quota, then deny.

### AM-02: Build order adds two short steps

Setup → **shared contract** (Zod schemas, error codes, `Catalog`) → **risk spike** (pdf.js under the strict CSP, one real AI call, a latency number) → UI/UX → backend → OOP audit → database → security testing → launch.

### AM-03: TypeScript pinned to 6.0.x (ADR 0005)

typescript-eslint 8.71 supports TypeScript `>=4.8.4 <6.1.0`, so we stay on 6.0.x until it supports 7.

## Proposed (confirm before the phase that needs them)

| Id    | Change                                                                                                                                                                       | Why                                                                                                                                                                                                                     | Phase        |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ |
| AM-10 | Count the anonymous daily quota per Turnstile-verified device. Use the IP only for burst limits, with a generous per-IP daily ceiling, and count IPv6 by its /64 prefix      | Indian mobile networks and campus Wi-Fi put many users behind one shared IPv4 address (CGNAT), so strangers would use up each other's free roast. IPv6 addresses change often, so a per-address limit is easy to bypass | Backend      |
| AM-11 | On every authenticated request, check the profile exists (or the session isn't revoked)                                                                                      | JWTs stay valid for up to 1 hour after account deletion, so S-25 fails with signature checks alone                                                                                                                      | Backend      |
| AM-12 | The "4th logged-in roast" screen upsells rewrites, or paid users get a higher roast cap                                                                                      | No pack includes roasts, so a roast paywall has nothing to sell (F-08)                                                                                                                                                  | UI/UX        |
| AM-13 | Keep rewrite history in the browser only, or reword the privacy promise                                                                                                      | C1 says "no resume text stored", but `generations` stores redacted rewrites for 30 days                                                                                                                                 | Database     |
| AM-14 | Free roasts use a 5–6 s first-attempt timeout                                                                                                                                | p95 under 8 s can't hold with 15 s per-provider timeouts plus fallback                                                                                                                                                  | Backend      |
| AM-15 | Script hashes go in Astro's CSP `<meta>` tag; `frame-ancestors` and the other non-script directives go in `_headers`; add `style-src`. Run the CSP in report-only mode first | Browsers enforce both policies, so a header `script-src` without the hashes would block Astro's scripts                                                                                                                 | UI/UX        |
| AM-16 | The output validator requires every PII placeholder to survive the AI rewrite                                                                                                | Otherwise restoring the user's real details fails silently                                                                                                                                                              | Backend      |
| AM-17 | Buy a domain before launch (about ₹700–900/year)                                                                                                                             | Every share card prints the URL, so moving off `pages.dev` later breaks all cards already shared and loses search ranking. A domain also helps Razorpay verification and unlocks the Cloudflare rate-limit rule         | Launch       |
| AM-18 | Use Cloudflare Web Analytics instead of GA4 and Meta Pixel                                                                                                                   | Cookieless and free, keeps the CSP simple, and fits the privacy positioning                                                                                                                                             | Launch       |
| AM-19 | Add an 18+ confirmation; name the AI providers as processors in the privacy notice                                                                                           | DPDP requires verified parental consent for under-18s, and users must be told who processes their data                                                                                                                  | UI/UX        |
| AM-20 | Reserve per-minute headroom for the paid tier on each provider                                                                                                               | Daily budget splits don't stop free traffic from hitting a provider's per-minute limit and causing 429s for paid users                                                                                                  | Backend      |
| AM-21 | Start Razorpay activation and website verification as soon as the policy pages are deployed                                                                                  | Approval can take days to weeks                                                                                                                                                                                         | End of UI/UX |
| AM-22 | Marketing copy says "we strip your contact details", not "all personal details are removed"                                                                                  | Name detection is heuristic, so the stronger claim overstates what we can guarantee                                                                                                                                     | UI/UX        |

## Verify against current docs

| Id   | Fact to check                                                                                                                      | Affects          |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| V-01 | Supabase project uses **asymmetric** JWT signing keys, so JWKS verification works (not the legacy HS256 secret)                    | Backend auth     |
| V-02 | Supabase direct DB connections are IPv6-only and GitHub runners lack IPv6. Nightly `pg_dump` must use the pooler connection string | Database backups |
| V-03 | Without Supabase's paid custom domain, Google's consent screen shows `*.supabase.co`                                               | Launch / trust   |
| V-04 | Whether `@react-pdf/renderer` and pdf.js need `'wasm-unsafe-eval'` under the strict CSP                                            | Risk spike       |
| V-05 | Workers free plan has a 10 ms CPU limit per request: measure the roast route                                                       | Backend          |
| V-06 | Rate-limit mechanism: the Workers rate-limiting binding on the free plan, or DB counters                                           | Backend          |
| V-07 | Razorpay webhook duplicate detection uses the `x-razorpay-event-id` header                                                         | Backend payments |
| V-08 | v1.1 only: Razorpay subscription signature order and UPI Autopay plan-change support                                               | v1.1             |
