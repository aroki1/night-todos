#!/usr/bin/env bash
# Build the web version into ./dist (run from the project root, in Git Bash).
# Needs: rustup target wasm32-unknown-unknown, wasm-bindgen-cli matching Rune's Cargo.lock,
# and a `python3` on PATH (on Windows: a shim that runs `python`).
set -euo pipefail
RUNE=${RUNE:-../rune-src}
mkdir -p dist
cp web/index.html web/manifest.webmanifest web/icon-192.png web/icon-512.png dist/
"$RUNE/scripts/web-build.sh" night-sky --out dist
