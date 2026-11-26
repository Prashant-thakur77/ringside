#!/usr/bin/env bash
# Final audit: attribution strings, AI-assistant mentions, the base repo's original name,
# committed secrets/keypairs, and broken links in README.md and docs/submission.md.
set -uo pipefail
cd "$(dirname "$0")/.."
fail=0
BASE_NAME="${BASE_REPO_NAME:-magicblock-engine-examples}"
PATTERN="Co-Authored-By|Generated with|Claude|Anthropic|ChatGPT|Copilot|OpenAI|AI assistant|AI-assistant|AI-generated|${BASE_NAME}"
echo "== tracked files"
if git grep -nIiE "$PATTERN" -- . ':!scripts/audit.sh'; then fail=1; else echo "0 hits"; fi
echo "== binary files"
for f in $(git ls-files | grep -vE '\.(rs|ts|tsx|md|json|toml|py|mjs|cjs|css|yml|yaml|sql|sh|lock|txt|csv|in|tmpl|html|example|gitignore|dockerignore|nvmrc)$'); do
  if strings "$f" 2>/dev/null | grep -qiE "$PATTERN"; then echo "hit in $f"; fail=1; fi
done
echo "== commit messages and history"
if git log --format='%an %ae%n%B' | grep -iE "$PATTERN"; then fail=1; else echo "0 hits"; fi
if git log -p | grep -iE "^\+.*(${BASE_NAME}|Co-Authored-By|Generated with)" | grep -v "scripts/audit.sh"; then fail=1; fi
echo "== secrets"
git ls-files | grep -E '^keys/|\.env$|\.env\.' | grep -v '.env.example' && fail=1
if git log -p | grep -iE "^\+.*(BEGIN [A-Z ]*PRIVATE KEY|secret_key|private_key\s*[:=])"; then fail=1; else echo "0 secret hits in history"; fi
if git grep -nE '^\s*\[\s*([0-9]{1,3}\s*,\s*){63}[0-9]{1,3}\s*\]\s*$' -- . ; then echo "keypair-shaped JSON committed"; fail=1; else echo "0 keypair files"; fi
echo "== links"
for u in $(grep -ohE 'https?://[^ )>"`]+' README.md docs/submission.md | sort -u); do
  code=$(curl -s -o /dev/null -w '%{http_code}' -L --max-time 20 "$u")
  case "$code" in 2*|3*) echo "ok   $code $u" ;; *) echo "FAIL $code $u"; fail=1 ;; esac
done
[ $fail -eq 0 ] && echo "AUDIT: PASS" || echo "AUDIT: FAIL"
exit $fail
