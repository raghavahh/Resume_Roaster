#!/bin/sh
# Proves the pre-commit hook blocks a fake secret and allows clean commits
# (PRD Phase 0 "Test it", S-21). Runs in a throwaway repo; never touches this one.
set -eu

root=$(git rev-parse --show-toplevel)
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

cd "$tmp"
git init -q
git config user.email probe@example.test
git config user.name probe
cp -r "$root/.githooks" .githooks
cp "$root/.gitleaks.toml" .gitleaks.toml
git config core.hooksPath .githooks

printf 'RAZORPAY_KEY_SECRET=abc123fake\n' > leaked.txt
git add leaked.txt
if git commit -q -m "probe: fake secret" >/dev/null 2>&1; then
  echo "FAIL: a commit containing a fake secret was NOT blocked" >&2
  exit 1
fi
echo "PASS: pre-commit hook blocked the fake secret"

git rm -q --cached leaked.txt
printf 'hello\n' > clean.txt
git add clean.txt
if ! git commit -q -m "probe: clean" >/dev/null 2>&1; then
  echo "FAIL: a clean commit was blocked" >&2
  exit 1
fi
echo "PASS: clean commit allowed"
