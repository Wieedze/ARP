---
description: Turn on sharing of this machine's failures, and show the lines that would be public. Sends nothing
disable-model-invocation: true
allowed-tools: Bash(node "${CLAUDE_PLUGIN_ROOT}/bin/arp.js" share on)
---

!`node "${CLAUDE_PLUGIN_ROOT}/bin/arp.js" share on`

Say what the output above says, briefly, and that `/arp:share-send` is what writes them. Run nothing else.
