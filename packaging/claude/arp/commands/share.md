---
description: Show which of this machine's failures would be public, and which stay here. Sends nothing
disable-model-invocation: true
allowed-tools: Bash(node "${CLAUDE_PLUGIN_ROOT}/bin/arp.js" share)
---

!`node "${CLAUDE_PLUGIN_ROOT}/bin/arp.js" share`

Say what the output above says, briefly. Run nothing else.
