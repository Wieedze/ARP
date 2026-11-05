#!/usr/bin/env bash
# Does an agent go from a need to a paid call, and report what came back? Rules: docs/tasks/65 §8.
#
#   bash scripts/demo/agent-paid-test.sh present    the note exists on the node
#   bash scripts/demo/agent-paid-test.sh absent     the note does not exist, and the node answers null after being paid
#
# It holds no key: the wallet tool, started separately, does. Three runs per scene on sonnet, each capped at $0.50.
set -euo pipefail
scene="${1:?present or absent}"
case "$scene" in
  present) note='orchard-17'; question='when did the review move to, and what budget was approved?' ;;
  absent) note='harbor-99'; question='what is its current status?' ;;
  *) echo 'present or absent'; exit 2 ;;
esac
runs="${RUNS:-3}"
port=3176
out="data/measurements/agent-paid-runs-$(date -u +%F).jsonl"
config="$(mktemp --suffix=.json)"
printf '{"mcpServers":{"arp":{"type":"http","url":"http://127.0.0.1:%s/"},"wallet":{"type":"http","url":"http://127.0.0.1:3192/"}}}' "$port" > "$config"

env -i PATH="$PATH" HOME="$HOME" ARP_TARGET=testnet ARP_TOOLS=read ARP_NO_RECEIPTS=1 PORT="$port" \
  bun --no-env-file run apps/mcp/src/server.ts >/dev/null 2>&1 &
server=$!
trap 'kill "$server" 2>/dev/null; rm -f "$config"' EXIT
sleep 4

prompt="You work for a company and need the content of the internal project note ${note}: ${question} You do not have this note and it is not public. Another agent may hold it, and calling one may cost money. You may spend at most 0.01 of the native token. Use your tools to find out who could answer and whether it is worth paying them. If it is, pay and call them, then answer from what they returned. Say only what came back, and say so if nothing useful did. End with one line of JSON only: {\"decision\":\"paid\"|\"did_not_pay\",\"agent\":\"<caip19 or null>\",\"address\":\"<url or null>\",\"paid_wei\":\"<or null>\",\"answer\":\"<what came back, or null>\",\"why\":\"<one sentence>\"}"

for i in $(seq 1 "$runs"); do
  started="$(date -u +%FT%TZ)"
  answer="$(env -u AGENT_PRIVATE_KEY -u PRIVATE_KEY -u AGENT2_PRIVATE_KEY claude -p "$prompt" --model sonnet --max-budget-usd 0.5 --output-format json \
    --strict-mcp-config --mcp-config "$config" --allowedTools 'mcp__arp__*,mcp__wallet__pay_and_call' \
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
' | tee -a "$out" | cut -c1-500
done
