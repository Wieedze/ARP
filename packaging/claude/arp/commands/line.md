---
description: Write one public, permanent line on testnet 13579. Needs a sponsoring service
argument-hint: --tool <url> --outcome worked|failed [--domain <category>] [--reason <reason>]
disable-model-invocation: true
allowed-tools: Bash(node "${CLAUDE_PLUGIN_ROOT}/bin/arp.js" line:*)
---

!`node "${CLAUDE_PLUGIN_ROOT}/bin/arp.js" line $ARGUMENTS`

Say what the output above says, briefly. Run nothing else.
