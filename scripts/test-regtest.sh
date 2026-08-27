#!/usr/bin/env bash
set -euo pipefail

repo_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
compose_file="$repo_dir/infra/zakura-regtest/compose.yml"

cd "$repo_dir"
docker compose -f "$compose_file" up -d --wait
trap 'docker compose -f "$compose_file" logs --no-color > /tmp/zcash-js-regtest.log 2>&1 || true' EXIT
npm run check
npm run test:live
