#!/usr/bin/env bash
# The gate task 33b names: the packed tarball, installed and run by Node with no Bun anywhere on
# PATH. `bun test` cannot say this, because it runs under Bun (rules/claims.md check 4).
#
#   NODE_BIN=/path/to/node22/bin bun run check:node
#
# NODE_BIN defaults to the directory of whatever `node` is on PATH. Needs network for `npm install`
# to fetch viem.
set -euo pipefail

here="$(cd "$(dirname "$0")/.." && pwd)"
node_bin="${NODE_BIN:-$(dirname "$(command -v node)")}"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

clean() { env -i PATH="$node_bin:/usr/bin:/bin" HOME="$work/home" "$@"; }
mkdir -p "$work/home" "$work/project"

fail() { echo "FAIL: $*" >&2; exit 1; }
pass() { echo "ok    $*"; }

clean bash -c 'command -v bun' >/dev/null 2>&1 && fail "bun is reachable on the clean PATH"
pass "no bun on PATH ($(clean node --version))"
[[ "$(clean node -p 'process.versions.node.split(".")[0]')" -ge 22 ]] || fail "node is older than 22"

tarball="$(cd "$here" && clean npm pack --silent --pack-destination "$work")"
pass "packed $tarball ($(du -h "$work/$tarball" | cut -f1))"

clean npm install --silent --no-audit --no-fund --prefix "$work/install" "$work/$tarball"
arp="$work/install/node_modules/.bin/arp"
[[ -x "$arp" ]] || fail "no arp binary after install"
pass "installed"

clean "$arp" --help | grep -q '^usage' || fail "--help"
pass "arp --help"
[[ "$(clean "$arp" --version)" == "$(clean node -p "require('$here/package.json').version")" ]] || fail "--version"
pass "arp --version"
set +e; clean "$arp" nope >/dev/null 2>&1; code=$?; set -e
[[ $code -eq 2 ]] || fail "an unknown command exits $code, not 2"
pass "arp <unknown> exits 2"

(cd "$work/project" && echo '{"tool_name":"mcp__x__y","tool_use_id":"t1","tool_response":"ok"}' | clean "$arp" hook)
grep -q '"call":"t1"' "$work/project/.arp/session.jsonl" || fail "the hook wrote no line"
pass "arp hook writes one line"

response="$(cd "$work/project" && printf '%s\n%s\n' \
  '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}' \
  '{"jsonrpc":"2.0","id":2,"method":"tools/list"}' | clean env ARP_NO_RECEIPTS=1 "$arp" mcp 2>/dev/null)"
grep -q '"name":"ARP"' <<<"$response" || fail "arp mcp did not answer initialize"
grep -q '"tools":\[' <<<"$response" || fail "arp mcp did not answer tools/list"
pass "arp mcp answers initialize and tools/list over stdio"

# An RPC is set so the check reaches the key; nothing is ever sent to it.
set +e; out="$(clean env INTUITION_RPC_URL=http://127.0.0.1:9 "$arp" node 2>&1)"; code=$?; set -e
[[ $code -ne 0 ]] && grep -q 'AGENT_PRIVATE_KEY' <<<"$out" || fail "arp node without a key: exit $code, $out"
pass "arp node refuses to start without AGENT_PRIVATE_KEY"

# The node over a real socket, against a local stub RPC that answers eth_chainId and nothing else.
# The key is a throwaway constant, never funded; the node signs receipts and sends nothing.
clean node -e '
  require("node:http").createServer((q, s) => { let b = ""; q.on("data", (c) => (b += c));
    q.on("end", () => { const r = JSON.parse(b); s.setHeader("content-type", "application/json");
      s.end(JSON.stringify({ jsonrpc: "2.0", id: r.id, result: "0x350b" })); }); }).listen(31901);
' >/dev/null 2>&1 &
stub=$!
(cd "$work/project" && exec env -i PATH="$node_bin:/usr/bin:/bin" HOME="$work/home" \
  INTUITION_RPC_URL=http://127.0.0.1:31901 AGENT_NODE_PORT=31902 \
  AGENT_PRIVATE_KEY=0x1111111111111111111111111111111111111111111111111111111111111111 \
  "$arp" node) >/dev/null 2>&1 &
node_pid=$!
trap 'kill "$node_pid" "$stub" 2>/dev/null || true; rm -rf "$work"' EXIT
health=""
for _ in $(seq 1 50); do
  health="$(curl -fs http://127.0.0.1:31902/healthz 2>/dev/null || true)"
  [[ -n "$health" ]] && break
  sleep 0.2
done
kill "$node_pid" "$stub" 2>/dev/null || true
[[ -n "$health" ]] || fail "arp node did not answer /healthz"
pass "arp node serves /healthz over a real socket"

(cd "$work/project" && clean npx --yes --package "$work/$tarball" arp --version >/dev/null) || fail "npx <tarball>"
pass "npx --package <tarball> arp --version"

echo "PASS"
