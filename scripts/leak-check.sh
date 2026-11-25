#!/usr/bin/env bash
# Fails if anything the package would ship matches a term in the denylist. The denylist lives outside the repo on purpose.
set -euo pipefail
cd "$(dirname "$0")/.."
DENY="${COSMOS_DENYLIST:-$HOME/.config/cosmos/denylist}"
[ -s "$DENY" ] || { echo "leak-check: denylist $DENY is missing or empty" >&2; exit 2; }
command -v npm >/dev/null || { echo "leak-check: npm is needed for npm pack" >&2; exit 2; }

files=$(npm pack --dry-run --json 2>/dev/null | bun -e 'const d = JSON.parse(await Bun.stdin.text()); for (const f of d[0].files) console.log(f.path)')
[ -n "$files" ] || { echo "leak-check: npm pack listed no files" >&2; exit 2; }

hits=0
while IFS= read -r f; do
  [ -f "$f" ] || continue
  if grep -nHiE -f "$DENY" "$f" >/dev/null 2>&1; then
    echo "leak-check: hit in $f (line numbers only):" >&2
    grep -noiE -f "$DENY" "$f" | cut -d: -f1 | sort -un | tr '\n' ' ' >&2; echo >&2
    hits=1
  fi
done <<< "$files"

tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
tgz=$(npm pack --pack-destination "$tmp" --silent 2>/dev/null | tail -1)
tar -xzf "$tmp/$tgz" -C "$tmp"
if grep -rlqiE -f "$DENY" "$tmp/package"; then
  echo "leak-check: hits in the packed tarball:" >&2
  grep -rliE -f "$DENY" "$tmp/package" | sed "s|$tmp/package/||" >&2
  hits=1
fi

count=$(printf '%s\n' "$files" | wc -l | tr -d ' ')
if [ "$hits" -ne 0 ]; then echo "leak-check: FAIL" >&2; exit 1; fi
echo "leak-check: ok ($count files, tarball clean)"
