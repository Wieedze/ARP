/** The tools ARP's MCP server serves. Data, not transport.
 *
 *  Its own module so it can be imported without pulling in the server's Bun runtime: the connector's
 *  tests assert the rig's declared capabilities against this list, and `@arp-protocol/core` must
 *  typecheck without `@types/bun`, which is installed nowhere in this repo (`tasks/21`).
 *
 *  A fixture declaring a tool this list does not contain is a `declared ≠ served` mismatch the
 *  verifier would report — against ARP's own rig. That nearly shipped once.
 *
 *  One read and two planners. **Neither planner signs or sends anything** — they return the calls
 *  an agent's own runtime signs with its own key (ADR `0038`), which is what keeps ARP from being a
 *  party to the loop (ADR `0035`). Every description here says so, because a caller who thinks ARP
 *  executed the plan will not check whether it did.
 */
export const TOOLS = [
  {
    name: 'arp_tool_reputation',
    description:
      'What agents staked on using a tool. Returns every incoming `uses` edge with its ' +
      'subject, its support vault and its counter vault, plus totals. Amounts always come ' +
      'with their position count: one vault here can hold 22.4 TRUST from a single account, ' +
      'and the figure alone would read as a market.',
    inputSchema: {
      type: 'object',
      properties: {
        tool_atom_id: {
          type: 'string',
          description: "The tool's Intuition atom id, 0x-prefixed 32 bytes.",
        },
        attested_by: {
          type: 'string',
          description:
            'Optional. Keep only edges this account holds a position in — a filter on ' +
            'who stands behind the edge, never an exclusivity claim (ADR 0034).',
        },
      },
      required: ['tool_atom_id'],
    },
  },
  {
    name: 'arp_declare_used',
    description:
      'Plan the on-chain declaration that an agent used a set of tools. Returns unsigned ' +
      'calls — ARP holds no key and sends nothing; you sign them with yours, in the order ' +
      'given. The subject is your canonical ERC-8004 identity atom, and the predicate is the ' +
      "shared `uses` term, so the edges are readable by anyone following Intuition's partner " +
      'guide. Needs no API key. Declaring costs a per-triple fee that is NOT recoverable: ' +
      'check `total_value_wei` before signing.',
    inputSchema: {
      type: 'object',
      properties: {
        agent_chain_id: {
          type: 'number',
          description:
            'The chain your ERC-8004 identity lives on — 8453 for the canonical registry.',
        },
        agent_token_id: {
          type: 'string',
          description: 'Your ERC-8004 token id, as a decimal string.',
        },
        tools: {
          type: 'array',
          items: { type: 'string' },
          description:
            'Canonical tool URIs — a schema URI, an MCP endpoint, an `ipfs://` document. The ' +
            'atom id derives from the URI, so nothing is pinned and no credential is needed.',
        },
      },
      required: ['agent_chain_id', 'agent_token_id', 'tools'],
    },
  },
  {
    name: 'arp_stake_on_used',
    description:
      'Plan deposits that put TRUST behind declarations already on chain. Returns unsigned ' +
      'calls; you sign and send them. The deposit lands on the `uses` EDGE, not on the ' +
      "tool's atom: the edge is the claim, it gets a counter-vault so the claim can be " +
      'contested, and it is the vault tool-reputation reads price. A triple that is not on ' +
      'chain yet is reported with `exists: false` and gets no call.',
    inputSchema: {
      type: 'object',
      properties: {
        receiver: {
          type: 'string',
          description:
            'Who receives the shares. In direct mode your own account; in delegated mode the ' +
            'delegator whose TRUST is spent. Not defaulted — guessing sends the position to ' +
            'the wrong party.',
        },
        targets: {
          type: 'array',
          description: 'The edges to back, each with the amount in wei as a string.',
          items: {
            type: 'object',
            properties: {
              triple_id: { type: 'string', description: 'The `uses` triple id, 0x + 32 bytes.' },
              amount_wei: { type: 'string', description: 'TRUST in wei. Must be above zero.' },
            },
            required: ['triple_id', 'amount_wei'],
          },
        },
      },
      required: ['receiver', 'targets'],
    },
  },
] as const;
