#!/usr/bin/env bash
# Creates a source zip next to this project folder (excludes heavy / reproducible dirs).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
NAME="${1:-character-controller-share}"
OUT="$(dirname "$ROOT")/${NAME}.zip"

rm -f "$OUT"
(
  cd "$ROOT"
  zip -r "$OUT" . \
    -x "node_modules/*" \
    -x "dist/*" \
    -x ".git/*" \
    -x "*.zip" \
    -x ".DS_Store" \
    -x "*/.DS_Store"
)

echo "Created: $OUT"
ls -lh "$OUT"
