#!/usr/bin/env bash
#
# Deploy the ARP on-chain stack (ModuleRegistry + both enforcers) to the
# Intuition Testnet (chainId 13579).
#
# The deploy is split across two Foundry scripts so each can stay under a
# strict pragma that matches its imports:
#
#   - DeployRegistry.s.sol   pragma ^0.8.24   -> ModuleRegistry
#   - DeployEnforcers.s.sol  pragma 0.8.23    -> Domain/TrustStake enforcers
#
# Usage:
#   scripts/deploy.sh              # dry-run (simulation only, no broadcast)
#   scripts/deploy.sh --broadcast  # real broadcast (spends gas)
#
# Requires `.env` at repo root with at least:
#   PRIVATE_KEY=0x...
#   INTUITION_TESTNET_RPC_URL=https://...
#
# Exits non-zero on any failure. Run twice (registry then enforcers) so the
# scripts/seed.ts post-step can pick up addresses from broadcast/.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ ! -f .env ]]; then
  echo "Error: .env not found at repo root. Copy .env.example and fill PRIVATE_KEY." >&2
  exit 1
fi

# shellcheck disable=SC1091
set -a; source .env; set +a

: "${PRIVATE_KEY:?PRIVATE_KEY must be set in .env}"
: "${INTUITION_TESTNET_RPC_URL:?INTUITION_TESTNET_RPC_URL must be set in .env}"

# Defaults / locations
BROADCAST_FLAG="${1:-}"

if [[ "$BROADCAST_FLAG" == "--broadcast" ]]; then
  echo "==> Mode: BROADCAST (real transactions, gas will be spent)"
  BROADCAST_ARG="--broadcast"
else
  echo "==> Mode: dry-run (simulation; no transactions sent)"
  BROADCAST_ARG=""
fi

cd "$ROOT/contracts"

echo ""
echo "==> Phase 1/2 — DeployRegistry"
forge script script/DeployRegistry.s.sol \
  --rpc-url "$INTUITION_TESTNET_RPC_URL" \
  --private-key "$PRIVATE_KEY" \
  $BROADCAST_ARG

echo ""
echo "==> Phase 2/2 — DeployEnforcers"
forge script script/DeployEnforcers.s.sol \
  --rpc-url "$INTUITION_TESTNET_RPC_URL" \
  --private-key "$PRIVATE_KEY" \
  $BROADCAST_ARG

echo ""
if [[ "$BROADCAST_FLAG" == "--broadcast" ]]; then
  echo "==> Done. Addresses available under contracts/broadcast/*.s.sol/13579/run-latest.json"
  echo "==> Next step: scripts/seed.ts to pin the module via Intuition + registerModule + createAtom."
else
  echo "==> Dry-run complete. To broadcast for real: scripts/deploy.sh --broadcast"
fi
