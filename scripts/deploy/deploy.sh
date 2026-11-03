#!/usr/bin/env bash
#
# Deploy what ARP has to deploy, and record it.
#
#   TrustStakeCapEnforcer   always     contracts/script/DeployEnforcers.s.sol
#   IdentityRegistry        with flag  contracts/script/DeployIdentityRegistry.s.sol (13579 only)
#
# ReceiptEnforcer is not deployed (task 43). ModuleRegistry and DomainScopeEnforcer were removed
# in 59ac83a; their addresses stay in data/deployments/.
#
# Usage:
#   scripts/deploy/deploy.sh [--broadcast] [--identity-registry] [--force]
#                            [--rpc-url URL] [--mainnet-i-confirmed]
#
#   (no flag)               dry run: simulate against the RPC, send nothing, write nothing
#   --broadcast             send, then write address and tx hash to data/deployments/<chainId>.json
#   --identity-registry     also deploy IdentityRegistry (testnet 13579 only, ADR 0025)
#   --force                 deploy even when the recorded address already has code
#   --rpc-url URL           default: INTUITION_TESTNET_RPC_URL from .env
#   --mainnet-i-confirmed   allow chain 1155. Only on the user's explicit confirmation for this
#                           session (CLAUDE.md). Every chain but 13579 is refused without it, and
#                           every chain but 13579 and 1155 is refused with it.
#
# Idempotent: a contract whose address in data/deployments/<chainId>.json has code is skipped
# unless --force. When that code differs from what src/ compiles to, it says so — that is how a
# stale deployment (e.g. TrustStakeCapEnforcer before ADR 0118) shows up.
#
# Requires .env at the repo root with PRIVATE_KEY, and INTUITION_TESTNET_RPC_URL unless --rpc-url.
# Requires forge, cast and jq.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

BROADCAST=false
IDENTITY=false
FORCE=false
MAINNET_CONFIRMED=false
RPC_URL=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --broadcast) BROADCAST=true ;;
    --identity-registry) IDENTITY=true ;;
    --force) FORCE=true ;;
    --mainnet-i-confirmed) MAINNET_CONFIRMED=true ;;
    --rpc-url) RPC_URL="${2:?--rpc-url needs a value}"; shift ;;
    *) echo "Error: unknown argument $1" >&2; exit 2 ;;
  esac
  shift
done

for tool in forge cast jq; do
  command -v "$tool" >/dev/null || { echo "Error: $tool not found" >&2; exit 1; }
done

if [[ ! -f .env ]]; then
  echo "Error: .env not found at repo root. Copy .env.example and fill PRIVATE_KEY." >&2
  exit 1
fi
# Sourced, not exported: only PRIVATE_KEY reaches the forge scripts, through the environment
# (`vm.envUint`), never through argv, where `ps` would show it to every local user.
# shellcheck disable=SC1091
source .env

: "${PRIVATE_KEY:?PRIVATE_KEY must be set in .env}"
export PRIVATE_KEY
if [[ -z "$RPC_URL" ]]; then
  : "${INTUITION_TESTNET_RPC_URL:?INTUITION_TESTNET_RPC_URL must be set in .env, or pass --rpc-url}"
  RPC_URL="$INTUITION_TESTNET_RPC_URL"
fi

CHAIN_ID="$(cast chain-id --rpc-url "$RPC_URL")"
case "$CHAIN_ID" in
  13579) ;;
  1155)
    if [[ "$MAINNET_CONFIRMED" != true ]]; then
      echo "Error: chain 1155 is mainnet. Refused without --mainnet-i-confirmed." >&2
      exit 1
    fi
    if [[ "$IDENTITY" == true ]]; then
      echo "Error: no ARP registry goes on mainnet (ADR 0025). Drop --identity-registry." >&2
      exit 1
    fi
    echo "==> MAINNET 1155, confirmed by flag. Real TRUST will be spent."
    ;;
  *)
    echo "Error: chain $CHAIN_ID is neither testnet 13579 nor mainnet 1155. Refused." >&2
    exit 1
    ;;
esac

DEPLOYMENTS="$ROOT/data/deployments/$CHAIN_ID.json"
[[ -f "$DEPLOYMENTS" ]] || { echo "Error: $DEPLOYMENTS not found" >&2; exit 1; }

if [[ "$BROADCAST" == true ]]; then
  echo "==> chain $CHAIN_ID — BROADCAST (real transactions, gas will be spent)"
  BROADCAST_ARG=(--broadcast)
else
  echo "==> chain $CHAIN_ID — dry run (simulation; nothing sent, nothing written)"
  BROADCAST_ARG=()
fi

# The two deployment files record ARP's contracts in different shapes: 13579 flat on .arp,
# 1155 nested under .arp.enforcers.<name>.address.
recorded_address() {
  local name="$1"
  if [[ "$CHAIN_ID" == 1155 ]]; then
    jq -r --arg n "$name" '.arp.enforcers[$n].address // empty' "$DEPLOYMENTS"
  else
    jq -r --arg n "$name" '.arp[$n] // empty' "$DEPLOYMENTS"
  fi
}

# Lower-case runtime code without solc's CBOR metadata trailer, whose length is its last 2 bytes.
# The trailer hashes source paths and comments, so two builds of one contract differ there only.
strip_metadata() {
  local hex="${1,,}" len
  hex="${hex#0x}"
  len=$((16#${hex: -4}))
  echo "${hex:0:${#hex}-(len + 2) * 2}"
}

# Exit 0 to deploy, 1 to skip.
should_deploy() {
  local name="$1" contract="$2" address code compiled
  address="$(recorded_address "$name")"
  if [[ -z "$address" ]]; then
    echo "    $name: nothing recorded, deploying"
    return 0
  fi
  code="$(cast code "$address" --rpc-url "$RPC_URL")"
  if [[ "$code" == "0x" ]]; then
    echo "    $name: recorded at $address but no code there, deploying"
    return 0
  fi
  compiled="$(cd contracts && forge inspect "$contract" deployedBytecode)"
  if [[ "$(strip_metadata "$code")" == "$(strip_metadata "$compiled")" ]]; then
    echo "    $name: $address already runs the current source"
  else
    # Exact for a contract without immutables (TrustStakeCapEnforcer). IdentityRegistry holds an
    # immutable domain separator, so its runtime code differs from any compile by construction.
    echo "    $name: $address has code that differs from what src/ compiles to"
  fi
  if [[ "$FORCE" == true ]]; then
    echo "    --force: deploying anyway"
    return 0
  fi
  echo "    skipped. Pass --force to deploy a new one."
  return 1
}

# Write a new deployment into the chain's file, keeping the address it replaces under a V<n> key.
record() {
  local name="$1" address="$2" tx="$3" previous previous_tx key n tmp now
  now="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  tmp="$(mktemp)"
  if [[ "$CHAIN_ID" == 1155 ]]; then
    jq -a --arg n "$name" --arg a "$address" --arg t "$tx" --arg d "$now" '
      .arp.enforcers[$n] as $old
      | (if $old.address then .arp.superseded = ((.arp.superseded // []) + [$old + {name: $n, status: "superseded", supersededAt: $d}]) else . end)
      | .arp.enforcers[$n] = {address: $a, tx: $t, deployedAt: $d, status: "active"}
    ' "$DEPLOYMENTS" >"$tmp"
  else
    previous="$(jq -r --arg n "$name" '.arp[$n] // empty' "$DEPLOYMENTS")"
    previous_tx="$(jq -r --arg n "$name" '.arp.deployedTxs[$n] // empty' "$DEPLOYMENTS")"
    key=""
    if [[ -n "$previous" ]]; then
      n=1
      while jq -e --arg k "${name}V$n" '.arp[$k] != null' "$DEPLOYMENTS" >/dev/null; do n=$((n + 1)); done
      key="${name}V$n"
    fi
    jq -a --arg n "$name" --arg a "$address" --arg t "$tx" --arg k "$key" \
      --arg pa "$previous" --arg pt "$previous_tx" --arg d "$now" \
      --arg explorer "$(jq -r '.chain.explorerUrl' "$DEPLOYMENTS")" '
      (if $k != "" then
        .arp[$k] = $pa
        | .arp.deployedTxs[$k] = $pt
        | .arp.explorerLinks[$k] = ($explorer + "/address/" + $pa)
      else . end)
      | .arp[$n] = $a
      | .arp.deployedTxs[$n] = $t
      | .arp.explorerLinks[$n] = ($explorer + "/address/" + $a)
    ' "$DEPLOYMENTS" >"$tmp"
  fi
  mv "$tmp" "$DEPLOYMENTS"
  echo "    recorded $name = $address (tx $tx) in data/deployments/$CHAIN_ID.json"
}

# Run one forge script; on broadcast, read the CREATE out of run-latest.json and record it.
deploy() {
  local name="$1" contract="$2" script="$3" run address tx
  echo ""
  echo "==> $contract"
  should_deploy "$name" "$contract" || return 0
  (
    cd contracts
    ARP_MAINNET_CONFIRMED="$MAINNET_CONFIRMED" forge script "script/$script" \
      --rpc-url "$RPC_URL" "${BROADCAST_ARG[@]}"
  )
  [[ "$BROADCAST" == true ]] || return 0
  run="contracts/broadcast/$script/$CHAIN_ID/run-latest.json"
  address="$(jq -r --arg c "$contract" '[.transactions[] | select(.transactionType == "CREATE" and .contractName == $c)][0].contractAddress' "$run")"
  tx="$(jq -r --arg c "$contract" '[.transactions[] | select(.transactionType == "CREATE" and .contractName == $c)][0].hash' "$run")"
  if [[ -z "$address" || "$address" == null || -z "$tx" || "$tx" == null ]]; then
    echo "Error: no CREATE for $contract in $run — nothing recorded" >&2
    exit 1
  fi
  [[ "$(cast code "$address" --rpc-url "$RPC_URL")" != "0x" ]] || {
    echo "Error: $address has no code after broadcast — nothing recorded" >&2
    exit 1
  }
  record "$name" "$(cast to-check-sum-address "$address")" "$tx"
}

deploy trustStakeCapEnforcer TrustStakeCapEnforcer DeployEnforcers.s.sol
if [[ "$IDENTITY" == true ]]; then
  deploy identityRegistry IdentityRegistry DeployIdentityRegistry.s.sol
fi

echo ""
if [[ "$BROADCAST" == true ]]; then
  echo "==> Done. Review the diff in data/deployments/$CHAIN_ID.json before committing it."
else
  echo "==> Dry run complete. Re-run with the same flags plus --broadcast to send."
fi
