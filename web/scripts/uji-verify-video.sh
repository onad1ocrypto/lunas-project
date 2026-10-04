#!/usr/bin/env bash
# Offline test for the verification rule engine (video/audio included).
#
#   bash web/scripts/uji-verify-video.sh
set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
out="${TMPDIR:-/tmp}/lunas-vverify"

rm -rf "$out" && mkdir -p "$out"
cd "$here/.."

npx tsc lib/verify.ts lib/data.ts \
  --outDir "$out" --module commonjs --target es2022 --moduleResolution node \
  --skipLibCheck --esModuleInterop --lib es2022,dom

cp "$here/verify-video.test.cjs" "$out/test.cjs"
cd "$out" && node test.cjs
