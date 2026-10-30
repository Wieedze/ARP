#!/usr/bin/env bash
# Send a plan in waves, resuming after the RPC's bandwidth quota refills.
#
#     scripts/deploy/send-plan-in-waves.sh <chainId> <plan.json> [pauseMs] [waitSeconds]
#
# Intuition's public RPC meters bytes over a long window and answers
# `Bandwidth limit exceeded` (-31002) when it is spent — reads included, so a plan cannot even be
# re-derived while throttled. Measured 2026-10-29: neither a smaller call (5.1M gas passed fine)
# nor a slower one (4s between calls changed nothing) avoids it. Only waiting does.
#
# A plan's calls are deterministic and ordered, so resuming is exact: count what landed, skip that
# many, send the rest. This loops that until the plan is exhausted.
set -uo pipefail

chain="${1:?usage: send-plan-in-waves.sh <chainId> <plan.json> [pauseMs] [waitSeconds]}"
plan="${2:?missing plan path}"
pause="${3:-2000}"
wait_for="${4:-900}"

total=$(python3 -c "import json;print(len(json.load(open('$plan'))))")
from=${FROM:-0}
wave=0

# Transaction hashes go here, one per line, and they are the point of keeping a record at all.
# The first version wrote each wave to a mktemp file and deleted it, so the hashes of 500+ writes
# were gone the moment the wave ended — the terms are re-derivable (ids are pure functions of the
# URL), a hash is not. `data/catalogue/*-13579.json` exists to hold them.
hashes="${plan%.json}.hashes.txt"
: >"$hashes"

while [ "$from" -lt "$total" ]; do
  wave=$((wave + 1))
  log="${plan%.json}.wave$wave.log"
  echo "wave $wave — resuming at $from of $total"
  bun run scripts/agent/agent-send-plan.ts \
    --chain "$chain" --plan "$plan" --from "$from" --pause "$pause" --execute >"$log" 2>&1
  landed=$(grep -cE '^\s+[0-9]+\. success' "$log" || true)
  grep -oE '0x[0-9a-f]{64}' "$log" >>"$hashes" || true
  from=$((from + landed))
  echo "wave $wave — $landed landed, $from of $total done · hashes in $hashes"

  if [ "$landed" -eq 0 ] && ! grep -q 'Bandwidth limit exceeded' "$log"; then
    echo "stopped for a reason that is not the quota:"
    tail -20 "$log"
    exit 1
  fi
  [ "$from" -lt "$total" ] && sleep "$wait_for"
done

echo "all $total calls landed"
