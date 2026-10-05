# Resume Roaster

Upload a resume, get a roast (Mild, Spicy or Nuclear, in English or Hinglish), a shareable Hireability Score card, and paid AI rewrites tailored to job posts. India-first, privacy by design: the resume file never leaves the browser, and contact details are stripped before any text reaches an AI.

This repo also holds the shared engine for two later products.

## Docs

- [docs/PRD.md](docs/PRD.md): the full plan (product, architecture, security, build phases, tests)
- [docs/PRD-AMENDMENTS.md](docs/PRD-AMENDMENTS.md): decisions that change the plan (these win)
- [docs/adr/](docs/adr/): architecture decision records
- [CLAUDE.md](CLAUDE.md): rules for every coding session

## Getting started

Requirements: Node 24+, git, and [gitleaks](https://github.com/gitleaks/gitleaks). The pre-commit hook blocks every commit without gitleaks.

```bash
npm install
npm run check
```

`npm run check` runs typecheck, lint, the format check and the tests with coverage.

## Status

Phase 0 (setup) is in progress. See the build order in [CLAUDE.md](CLAUDE.md).
