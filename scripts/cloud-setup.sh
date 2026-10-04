#!/usr/bin/env bash
set -euo pipefail
cd /workspace/inventos-codex
node --version
pnpm --version
pnpm install --frozen-lockfile
pnpm check
pnpm build
