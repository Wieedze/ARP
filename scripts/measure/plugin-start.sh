#!/usr/bin/env bash
# The Claude Code plugin carrying its CLI: size, start time, sessions starting together, no network,
# and what a version adds to the repository. ADR `0145`, amended 2026-11-06. Writes nothing but one JSON
# line per figure on stdout.
#
#   bash scripts/measure/plugin-start.sh [older-commit] [rounds] > data/measurements/plugin-start-<date>.jsonl
#
# Each session is `apps/cli/scripts/plugin-session.mjs`: the command in `.mcp.json`, then `initialize` and
# `tools/list`. In a throwaway container with no network, an empty HOME per round, and a read-only copy of the
# plugin. A failure is a session that listed no tool. `older-commit` is built in a throwaway clone: the second
# version, for the repository's figure.
set -euo pipefail
older="${1:-HEAD~30}"; rounds="${2:-20}"
root="$(cd "$(dirname "$0")/../.." && pwd)"
plugin="$root/packaging/claude/arp"
work="$(mktemp -d)"; trap 'rm -rf "$work"' EXIT

bytes="$(wc -c < "$plugin/bin/arp.js")"
gz="$(gzip -9c "$plugin/bin/arp.js" | wc -c)"
echo "{\"figure\":\"bin/arp.js\",\"commit\":\"$(git -C "$root" rev-parse --short HEAD)\",\"bytes\":$bytes,\"gzip_9\":$gz}"

docker run --rm --network none -e ROUNDS="$rounds" \
  -v "$plugin:/plugin:ro" -v "$root/apps/cli/scripts/plugin-session.mjs:/session.mjs:ro" \
  node:22-bookworm-slim sh -c '
node --version >&2
mkdir -p /tmp/p && cd /tmp/p
# Alone, each with an empty home: the time from the launch to the list of tools.
i=0; while [ $i -lt 20 ]; do
  rm -rf /tmp/h; mkdir /tmp/h; HOME=/tmp/h node /session.mjs /plugin | sed "s/^/{\"figure\":\"alone\",\"run\":$i,\"session\":/;s/\$/}/"
  i=$((i+1))
done
# Four together, in the same empty home, as four terminals opened at once.
r=0; while [ $r -lt "$ROUNDS" ]; do
  rm -rf /tmp/h; mkdir /tmp/h
  for s in 1 2 3 4; do
    ( HOME=/tmp/h node /session.mjs /plugin > /tmp/out.$s 2>&1; echo $? > /tmp/code.$s ) &
  done
  wait
  for s in 1 2 3 4; do
    echo "{\"figure\":\"together\",\"round\":$r,\"slot\":$s,\"exit\":$(cat /tmp/code.$s),\"session\":$(cat /tmp/out.$s)}"
  done
  r=$((r+1))
done'

# What a version adds, once packed: this bundle and one built from an older commit, in a repository of their own.
git clone --quiet --shared "$root" "$work/old"
git -C "$work/old" checkout --quiet "$(git -C "$root" rev-parse "$older")"
( cd "$work/old" && bun install --frozen-lockfile >/dev/null 2>&1 && bun run --cwd packages/protocol build >/dev/null 2>&1 \
  && cd apps/cli && bun build src/cli.ts --outfile "$work/old.js" --target=node --format=esm \
    --external ./hook.js --external @metamask/smart-accounts-kit --banner '#!/usr/bin/env node' >/dev/null )
git init --quiet "$work/repo"
packed() { git -C "$work/repo" gc --quiet --aggressive --prune=now; git -C "$work/repo" count-objects -v | awk '/size-pack/ {print $2}'; }
commit() { cp "$1" "$work/repo/arp.js"; git -C "$work/repo" add arp.js; git -C "$work/repo" -c user.name=m -c user.email=m@m commit --quiet -m v; }
loose() { local id; id="$(git -C "$work/repo" rev-parse HEAD:arp.js)"; wc -c < "$work/repo/.git/objects/${id:0:2}/${id:2}"; }
commit "$work/old.js"; first_kib="$(packed)"
commit "$plugin/bin/arp.js"; loose_bytes="$(loose)"; both_kib="$(packed)"
echo "{\"figure\":\"repository\",\"older\":\"$(git -C "$work/old" rev-parse --short HEAD)\",\"older_date\":\"$(git -C "$work/old" log -1 --format=%cs)\",\"older_bytes\":$(wc -c < "$work/old.js"),\"one_version_packed_kib\":$first_kib,\"two_versions_packed_kib\":$both_kib,\"second_version_before_gc_bytes\":$loose_bytes,\"changed_lines\":$(diff "$work/old.js" "$plugin/bin/arp.js" | grep -c '^[<>]' || true)}"
