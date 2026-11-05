#!/usr/bin/env bash
# Does a first `npx` run, killed part-way, leave a package that stays broken? ADR `0145`.
#
#   bash scripts/measure/npx-kill.sh <registry-url> <docker-network> <package@version> [moments in seconds...]
#
# In a throwaway container, against the registry given. For each moment: an empty npx cache, one run killed at
# that moment, then one more run. Prints one line per moment, and the time of a clean install. A moment later
# than the clean install tests nothing, as the install has already finished, so it says so.
set -euo pipefail
registry="${1:?registry}"; network="${2:?network}"; pkg="${3:?package}"; shift 3
moments="${*:-0.05 0.1 0.15 0.2 0.25 0.3 0.35 0.4 0.45 0.5 0.55 0.6 0.65 0.7 0.8 1 1.5 2 3 4 5 6 7 8}"
docker run --rm --network "$network" -e npm_config_registry="$registry" -e PKG="$pkg" -e MOMENTS="$moments" node:22-bookworm-slim sh -c '
mkdir -p /tmp/p && cd /tmp/p
s=$(date +%s%N); npx -y "$PKG" --help >/dev/null 2>&1; e=$(date +%s%N); clean=$(( (e-s)/1000000 ))
echo "{\"package\":\"$PKG\",\"clean_install_ms\":$clean}"
for wait in $MOMENTS; do
  rm -rf /root/.npm/_npx /root/.npm/_cacache
  npx -y "$PKG" --help >/dev/null 2>&1 &
  sleep "$wait"; pkill -TERM -f "npm exec" 2>/dev/null || true; pkill -TERM -x npm 2>/dev/null || true; sleep 0.5
  if npx -y "$PKG" --help 2>&1 | head -1 | grep -q "arp 0.0.1"; then r=ok; else r=broken; fi
  echo "{\"killed_at_s\":$wait,\"after\":\"$r\"}"
done'
