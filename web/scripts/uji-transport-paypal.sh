#!/usr/bin/env bash
# Offline harness for web/lib/paypal.ts — PayPal is stubbed, no credentials, no network.
#
#   bash web/scripts/uji-transport-paypal.sh
#
# Compiles the client to a temp dir (so the repo stays clean) and runs the assertions in
# paypal-transport.test.cjs: retries gated on idempotency keys, backoff inside a wait budget,
# Retry-After, PayPal wire errors (debug_id), stable payout/refund keys, token caching.
set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
out="${TMPDIR:-/tmp}/lunas-pptest"

rm -rf "$out" && mkdir -p "$out"
cd "$here/.."

npx tsc lib/paypal.ts \
  --outDir "$out" --module commonjs --target es2022 --moduleResolution node \
  --skipLibCheck --esModuleInterop --lib es2022,dom

cp "$here/paypal-transport.test.cjs" "$out/test.cjs"
cd "$out" && node test.cjs
