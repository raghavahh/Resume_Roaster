# ADR 0005: Tooling, version pinning and secret scanning

- Status: Accepted
- Date: 2026-10-05

## Context

The PRD asks for strict TypeScript, type-aware linting, minimal dependencies with pinned versions, and a pre-commit secret scan that is proven to block a fake key.

## Decision

- **npm workspaces**, exact versions (`save-exact`), committed lockfile, `npm ci` in CI. Node >= 24.
- **TypeScript 6.0.x**, pinned: typescript-eslint 8.71 supports `>=4.8.4 <6.1.0`, so TypeScript 7 waits until it's supported. Strict flags include `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes`.
- **ESLint** (`strictTypeChecked` + `stylisticTypeChecked`) enforces the OOP and security rules from PRD Phase 3: explicit member accessibility, no type assertions, size limits, banned HTML-injection points, and a pure domain (no `fetch`, `Date.now()`, `new Date()`, `Math.random()`).
- **Prettier** for formatting; **Vitest** with v8 coverage and per-file thresholds.
- **Git hooks without Husky:** `core.hooksPath=.githooks`, set by the npm `prepare` script. That's one less dependency.
- **gitleaks** runs on staged changes before every commit. It uses the default rules plus a project rule that catches any value assigned to a known secret name, whatever its entropy. The hook **fails closed** if gitleaks isn't installed.

## Consequences

- Every contributor machine needs gitleaks installed (`winget install --id Gitleaks.Gitleaks -e` on Windows).
- Bumping TypeScript to 7 means checking typescript-eslint's peer range first.
