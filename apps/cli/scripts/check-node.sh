#!/usr/bin/env bash
# The gate task 33b names: the packed tarball, installed and run by Node with no Bun anywhere on
# PATH. `bun test` cannot say this, because it runs under Bun (rules/claims.md check 4).
#
#   NODE_BIN=/path/to/node22/bin bun run check:node
#
# NODE_BIN defaults to the directory of whatever `node` is on PATH. The package has no dependency
# (ADR `0145`), and the check below that it stays so needs no network.
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
[[ "$(ls "$work/install/node_modules" | wc -l)" -eq 1 ]] || fail "the package pulled dependencies: $(ls "$work/install/node_modules" | tr "\n" " ")"
pass "no dependency installed (ADR 0145)"

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

# A project's planted programs must not run through the launch line (ADR `0145`). `npx` is the one thing to
# fetch here, so it runs from the tarball, with npm's own `--package`.
planted="$work/planted"; mkdir -p "$planted/node_modules/.bin"
for name in node npx arp skills; do
  printf '#!/bin/sh\ntouch "%s/PWNED"\n' "$work" > "$planted/node_modules/.bin/$name"; chmod +x "$planted/node_modules/.bin/$name"
done
(cd "$planted" && clean sh -c "cd / && exec npx --prefix / -y --package '$work/$tarball' arp --version") >/dev/null 2>&1 || fail "the launch from outside the project did not start"
[[ ! -e "$work/PWNED" ]] || fail "a planted program ran through the launch line"
pass "a project's planted node, npx and arp do not run"

# The plugin carries the CLI (ADR `0145`, amended 2026-11-06): no install, no `npx` for the server, and the
# project is the working directory. A copy outside the repo, as nothing above it may help. The search is the
# one thing that still runs `npx`, so a stub stands in for it and says it ran, and none of the planted ones may.
plugin="$work/plugin"; cp -r "$here/../../packaging/claude/arp" "$plugin"
stub_npx="$work/stub-bin"; mkdir -p "$stub_npx"
printf '#!/bin/sh\ntouch "%s/SEARCH_RAN"\nexit 0\n' "$work" > "$stub_npx/npx"; chmod +x "$stub_npx/npx"
(cd "$planted" && env -i PATH="$stub_npx:$node_bin:/usr/bin:/bin" HOME="$work/home" ARP_HOME="$work/home/.arp-plugin" \
  INTUITION_GRAPHQL_URL=http://127.0.0.1:9/ INTUITION_RPC_URL=http://127.0.0.1:9/ GITHUB_API_URL=http://127.0.0.1:9/ \
  node "$here/scripts/plugin-session.mjs" "$plugin" --search "video editing") > "$work/plugin-session.json" \
  || fail "the plugin's server did not answer: $(cat "$work/plugin-session.json")"
grep -q '"arp_pulse"' "$work/plugin-session.json" || fail "the plugin's server listed no arp_pulse"
pass "the plugin's bin/arp.js answers from a copy, with nothing installed"
[[ -e "$work/SEARCH_RAN" ]] || fail "the search did not run: the check below would prove nothing"
[[ ! -e "$work/PWNED" ]] || fail "a planted program ran through the plugin"
pass "from a project with planted node, npx, arp and skills: the search ran, and none of them did"
(cd "$planted" && echo '{"tool_name":"mcp__x__y","tool_use_id":"t2","tool_response":"ok"}' | clean node "$plugin/bin/hook.js")
grep -q '"call":"t2"' "$planted/.arp/session.jsonl" || fail "the plugin's hook wrote no line in the project"
pass "the plugin's hook writes in the project, its working directory"
echo '{"type":"commonjs"}' > "$work/package.json"
clean node "$plugin/bin/arp.js" --version >/dev/null 2>&1 || fail "bin/arp.js refused under a commonjs package.json"
rm "$work/package.json"
pass "bin/arp.js runs under a parent package.json that says commonjs"

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

mkdir -p "$work/home/.claude"
(cd "$work/project" && clean "$arp" init --yes --runtime claude >/dev/null) || fail "arp init"
grep -q '"arp"' "$work/home/.claude.json" || fail "arp init wrote no MCP entry"
[[ -f "$work/home/.arp/bin/hook.js" ]] || fail "arp init copied no hook"
(cd "$work/project" && clean env ARP_NO_RECEIPTS=1 "$arp" doctor --runtime claude >/dev/null) || fail "arp doctor after init"
(cd "$work/project" && clean "$arp" uninstall --yes --runtime claude >/dev/null) || fail "arp uninstall"
[[ ! -f "$work/home/.arp/bin/hook.js" ]] || fail "arp uninstall left the hook"
pass "arp init, doctor and uninstall, against a clean home"

(cd "$work/project" && clean npx --yes --package "$work/$tarball" arp --version >/dev/null) || fail "npx <tarball>"
pass "npx --package <tarball> arp --version"

echo "PASS"
