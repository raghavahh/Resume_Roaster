# Resume Roaster: rules for every Claude session

Source of truth: [docs/PRD.md](docs/PRD.md), as changed by [docs/PRD-AMENDMENTS.md](docs/PRD-AMENDMENTS.md) (amendments win). Decisions: [docs/adr/](docs/adr/).

## Commands

- `npm run check`: typecheck + lint + format check + tests with coverage. Must pass before every commit.
- `npm test`, `npm run lint`, `npm run format`, `npm run secrets:scan` (full-history gitleaks scan).
- Node >= 24. Exact versions only (`.npmrc` has `save-exact`). Commit `package-lock.json`; CI uses `npm ci`.
- TypeScript is pinned to 6.0.x because typescript-eslint does not support 7.x yet. Don't bump it until it does.

## Workflow

- After each completed change: run `npm run check`, commit, and **push to `origin main`** (the owner's standing instruction).
- Never bypass hooks (`--no-verify`). The pre-commit hook runs gitleaks and fails closed without it.
- Build order: Phase 0 setup -> shared contract -> risk spike -> UI/UX (MSW mocks) -> backend (in-memory repos) -> OOP audit -> database -> security testing -> launch.

## Layout (npm workspaces)

- `packages/domain`: pure TypeScript. Value objects, `Catalog`, errors, Zod schemas. No I/O.
- `packages/browser`, `packages/ui`, `apps/roaster`, `api/`, `supabase/`, `e2e/`, `security/`: added in later phases (PRD B3).
- Workspace package scope: `@engine/*` (shared by all three products).

## Security (non-negotiable, PRD Part C)

- No secrets in code, chat, issues, screenshots or commits. Secrets live only in `wrangler secret put` and git-ignored `.dev.vars`.
- Prices, user ids, credits, limits and entitlement status are decided **on the server only**. The browser sends `packId`/`passId`, never amounts.
- User id comes **only** from the verified JWT, never from a request body. Every request schema is Zod `.strict()`.
- Never render HTML from data: no `innerHTML`, `dangerouslySetInnerHTML`, `set:html`, `document.write` (lint-enforced).
- Resume text is never stored. PII is redacted in the browser **and** again on the server; the redaction vault never leaves the browser.
- Money paths are idempotent and use three checks: signature (constant-time compare), provider API lookup, and a DB unique constraint.
- Fail closed: if verification is unsure, deny.
- Every security rule gets an attack test (PRD E3). A rule without a test doesn't count.

## OOP and code rules (PRD Phase 3, lint-enforced where possible)

- One class, one job. Functions <= 30 lines, files <= 300 lines.
- Fields are `#private` or `private readonly`. Explicit `public`/`private` on every member. Expose behaviour, not data.
- Value objects are immutable and validate themselves (e.g. `Money` can't be negative or fractional).
- Depend on interfaces (ports); inject through constructors. Only the composition root (`api/src/container.ts`) wires adapters.
- `packages/domain` is pure: no `fetch`, env, `Date.now()`, `new Date()`, `Math.random()`. Inject `Clock` and similar ports.
- No `any`, no non-null `!`, no type assertions (`as const` is fine). Parse with Zod at every boundary.
- Errors are typed `AppError` subclasses, mapped to HTTP in exactly one place.
- React components are functions; logic lives in classes and hooks; components never call `fetch` (use `ApiClient`).
- Test first for money and credit code. 100% coverage on `Money`, `Catalog` and the entitlement/payment services.
