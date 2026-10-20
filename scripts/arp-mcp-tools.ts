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
    name: 'arp_identity',
    description:
      'Whether an agent has the identity atom a `uses` edge must carry as its subject. Ask this ' +
      "first: the atom is written by Intuition's mirror, and measured 2026-10-20 the mirror holds " +
      '28,648 against a Base registry whose highest minted id is 309,925 — so for about nine ' +
      'agents in ten the answer is no, and every other tool here fails for them until it is yes. A ' +
      'read; it reports the gap rather than closing it, because closing it is a write. The atom ids ' +
      'are computable from your identity alone, with no API key.',
    inputSchema: {
      type: 'object',
      properties: {
        agent_chain_id: {
          type: 'number',
          description:
            'The chain the ERC-8004 identity lives on — 8453 for the canonical registry.',
        },
        agent_token_id: {
          type: 'string',
          description: 'The ERC-8004 token id, as a decimal string.',
        },
        registry: {
          type: 'string',
          description:
            'Optional. The identity registry, when it is not the canonical one. Needed on any ' +
            'chain where that address has no code — it has none on Intuition testnet 13579.',
        },
      },
      required: ['agent_chain_id', 'agent_token_id'],
    },
  },
  {
    name: 'arp_find_agents',
    description:
      'Agents the graph holds, paged. Two orders, named for what they measure and not for a ' +
      'ranking: `evidence-quantity` is how many statements the source holds about an agent, ' +
      '`economic-conviction` is TRUST on its own atom. ARP composes no score — you get the parts. ' +
      '`total` is the cohort size, never the page length, and an agent with several `same as` ' +
      'edges is reported as ambiguous rather than resolved to one of them.',
    inputSchema: {
      type: 'object',
      properties: {
        order: {
          type: 'string',
          enum: ['evidence-quantity', 'economic-conviction'],
          description: 'Defaults to evidence-quantity.',
        },
        limit: { type: 'number', description: '1 to 100. Defaults to 25.' },
        offset: { type: 'number', description: 'Defaults to 0.' },
      },
      required: [],
    },
  },
  {
    name: 'arp_find_tools',
    description:
      'Tools agents declared using, with where each one is hosted and what stands behind it. The ' +
      'step before `arp_tool_reputation`, which needs an atom id you do not have yet. ' +
      '`hosted_at` is the pointer: ARP stores no tool, so read the listing, go to the host and ' +
      'decide for yourself — it is a home page, not a call target, and 28 of the 80 tools on ' +
      'mainnet carry none. `paid_declarations` is how many declarations somebody paid to stand ' +
      'behind; there is no summed position count, because positions are counted per vault and a ' +
      'sum across edges counts nothing. Agent declarations only — the `uses` predicate is shared ' +
      'and most of what sits on it is ordinary prose.',
    inputSchema: {
      type: 'object',
      properties: {
        order: {
          type: 'string',
          enum: ['priced-edges', 'conviction', 'declarations'],
          description:
            'What to rank by, and none is a score: how many declarations were paid for, the TRUST ' +
            'behind them, or how many exist. Defaults to priced-edges.',
        },
        limit: { type: 'number', description: '1 to 100. Defaults to 25.' },
        curve_id: {
          type: 'number',
          description:
            'Which bonding curve the figures are read at. Defaults to the chain default, 1 — ' +
            'which is where the vaults are and not where the money is. Measured on mainnet ' +
            '2026-10-20: curve 1 "Linear Curve" holds 26.20 TRUST at a share price of 1.000-1.060 ' +
            'over 185 vaults; curve 2 "Offset Progressive Curve" holds 219.54 TRUST at 3.000-4.181 ' +
            'over 28. Two different markets, so ask for the one you mean.',
        },
      },
      required: [],
    },
  },
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
        curve_id: {
          type: 'number',
          description:
            'Which bonding curve to take the position on. Defaults to the chain default, 1, and ' +
            'the default is not the interesting curve. Measured on mainnet 2026-10-20: curve 1 ' +
            '"Linear Curve" is 26.20 TRUST at a share price of 1.000-1.060; curve 2 "Offset ' +
            'Progressive Curve" is 219.54 TRUST at 3.000-4.181. A position that appreciates has ' +
            'to ask for curve 2. The two are different markets, not two views of one.',
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
