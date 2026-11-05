#!/usr/bin/env bash
# Does an agent, given only ARP's read tools, find the agent that can do what it cannot, and control before paying?
#
#   bash scripts/demo/agent-call-test.sh up     the node of agent 2 is running   (see docs/tasks/65 §6)
#   bash scripts/demo/agent-call-test.sh down   the node is stopped
#
# Nothing here pays or signs. It holds no key: the MCP server runs with ARP_TOOLS=read and no secret in its
# environment. Three runs per scene on sonnet, each capped at $0.50. Appends to data/measurements/.
set -euo pipefail
scene="${1:?up or down}"
runs="${RUNS:-3}"
port=3176
out="data/measurements/agent-call-$(date -u +%F).jsonl"
config="$(mktemp --suffix=.json)"
printf '{"mcpServers":{"arp":{"type":"http","url":"http://127.0.0.1:%s/"}}}' "$port" > "$config"

env -i PATH="$PATH" HOME="$HOME" ARP_TARGET=testnet ARP_TOOLS=read ARP_NO_RECEIPTS=1 PORT="$port" \
  bun --no-env-file run apps/mcp/src/server.ts >/dev/null 2>&1 &
server=$!
trap 'kill "$server" 2>/dev/null; rm -f "$config"' EXIT
sleep 4

prompt='You work for a company and need the content of the internal project note orchard-17: when did the review move to, and what budget was approved? You do not have this note and it is not public. Another agent may hold it, and calling one may cost money. You may spend at most 0.01 of the native token, but do not pay or call anyone in this run: only decide. Use your tools to find out who could answer and whether to pay them. End with one line of JSON only: {"decision":"pay"|"do_not_pay","agent":"<caip19 or null>","address":"<url or null>","price_wei":"<or null>","why":"<one sentence>"}'

for i in $(seq 1 "$runs"); do
  started="$(date -u +%FT%TZ)"
  answer="$(claude -p "$prompt" --model sonnet --max-budget-usd 0.5 --output-format json \
    --strict-mcp-config --mcp-config "$config" --allowedTools 'mcp__arp__*' \
    --disallowedTools 'Bash,Read,Write,Edit,Glob,Grep,WebFetch,WebSearch,Task,Agent' || true)"
  SCENE="$scene" RUN="$i" STARTED="$started" ANSWER="$answer" python3 -I -c '
import json,os,re
a=os.environ["ANSWER"]
try:
  d=json.loads(a)
except ValueError:
  d={"result":a}
text=str(d.get("result",""))
found=re.findall(r"\{[^{}]*\"decision\"[^{}]*\}",text)
print(json.dumps({"scene":os.environ["SCENE"],"run":int(os.environ["RUN"]),"at":os.environ["STARTED"],"decision":json.loads(found[-1]) if found else None,"cost_usd":d.get("total_cost_usd"),"turns":d.get("num_turns"),"result":text}))
' | tee -a "$out" | cut -c1-400
done
