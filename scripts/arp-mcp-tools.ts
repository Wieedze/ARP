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
      'The tools ARP can see, with where each one is hosted and what stands behind it. The step ' +
      'before `arp_tool_reputation`, which needs an atom id you do not have yet. Two populations, ' +
      'and `provenance` says which: `declared` means an agent wrote a `uses` edge naming it, ' +
      '`registered` means somebody created its atom and opened a market without any agent having ' +
      'declared anything. Never add the two figures — they are counted on different vaults. ' +
      '`hosted_at` is the pointer: ARP stores no tool, so read the listing, go to the host and ' +
      'decide for yourself — it is a home page, not a call target, and 28 of the 85 distinct ' +
      'tools on mainnet `uses` edges carry none while 9 more carry the string "null" ' +
      '(2026-10-28). `paid_declarations` is how many declarations somebody paid to ' +
      'stand behind, and is null on a registered row because that needs the per-edge vaults. ' +
      '`position_count` is the one that says whether anybody staked on a registered tool: every ' +
      'term is born holding `minShare`, so its assets are non-zero either way. `title` and ' +
      '`purpose` come from this repo, not the chain — `purpose` is the description the tool ' +
      'publishes about itself, quoted and dated in `purpose_read_at`, and both are null for a ' +
      'tool nobody catalogued. Agent declarations only on the declared side: the `uses` predicate ' +
      'is shared and most of what sits on it is ordinary prose.',
    inputSchema: {
      type: 'object',
      properties: {
        domain: {
          type: 'string',
          description:
            'Search by NEED instead of listing everything: one lowercase word naming what the ' +
            'tool is for — `payment`, `database`, `design`. The subtree under it is walked first, ' +
            'so asking for `payment` returns a tool tagged `card` because the hierarchy says ' +
            '`card` sits under `payment`. The response carries `domains_walked` so you can see ' +
            'which hop did it. A tool carries one tag at its deepest domain and the ancestors are ' +
            'never written, so there is no point asking for an ancestor you invented — ask for ' +
            'the broad word and let the walk do the work. Omit it to list everything. A domain ' +
            'whose chain of hierarchy triples up to the root has one unfunded link returns ' +
            'nothing from above that link: the hierarchy has to be paid for, and that is the ' +
            'mechanism, not a fault. The index you are reading is the one this node is configured with, and you cannot change it per call — that is deliberate: `has tag` and the hierarchy are permissionless to WRITE, so the filings are only an index when read through one chosen set of positions. The response names it in `domain_attestor`.',
        },
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
      "tool's atom: the edge is the claim YOU made, so a reader can attribute the position " +
      'back to you, and it is the vault tool-reputation reads price. The atom carries the ' +
      'market on the thing itself, open to anyone. A triple that is not on chain yet is ' +
      'reported with `exists: false` and gets no call.',
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
  {
    name: 'arp_take_position',
    description:
      "Plan a deposit on an ATOM's vault — the market on the thing itself, not a claim about " +
      'it. Returns unsigned calls; you sign and send them. This is a different act from ' +
      '`arp_stake_on_used`: that one backs the `uses` EDGE you wrote, which is attributable to ' +
      'you; this one buys into the market on the tool or agent itself, which anyone may do for ' +
      'any reason. The two are never summed. A position can be left again with ' +
      '`arp_exit_position` — a deposit nobody can withdraw is a donation.',
    inputSchema: {
      type: 'object',
      properties: {
        term_id: {
          type: 'string',
          description: "The atom's term id, 0x + 32 bytes. `arp_find_tools` returns these.",
        },
        amount_wei: {
          type: 'string',
          description:
            "TRUST in wei. Must be at least the chain's minDeposit, which is READ per plan and " +
            'is 10x apart between chains: 0.01 TRUST on mainnet 1155 against 0.001 on testnet ' +
            '13579. An amount tuned on testnet is a tenth of the mainnet floor.',
        },
        receiver: {
          type: 'string',
          description:
            'Who receives the shares. In direct mode your own account; in delegated mode the ' +
            'delegator whose TRUST is spent. Not defaulted — guessing sends the position to the ' +
            'wrong party.',
        },
        curve_id: {
          type: 'number',
          description:
            'Which bonding curve. Defaults to the chain default, 1, and the default is not the ' +
            'interesting curve. Measured on mainnet 2026-10-20: curve 1 is a share price of ' +
            '1.000-1.060, curve 2 is 3.000-4.181. Two different markets, not two views of one.',
        },
        min_shares: {
          type: 'string',
          description:
            'Slippage floor in shares. Zero accepts any price, which on a bonding curve between ' +
            'planning and signing is how a deposit buys less than it was quoted.',
        },
      },
      required: ['term_id', 'amount_wei', 'receiver'],
    },
  },
  {
    name: 'arp_exit_position',
    description:
      'Plan a redemption of shares on an atom back into TRUST. Returns unsigned calls; you ' +
      'sign and send them. This call sends NO value — it is the only one on this server that ' +
      'does not. Omit `shares` to leave the whole position. What it fetches is READ from ' +
      '`previewRedeem`, never computed: the exit fee is a governance parameter and the curve ' +
      'is not linear in shares on curve 2.',
    inputSchema: {
      type: 'object',
      properties: {
        term_id: { type: 'string', description: "The atom's term id, 0x + 32 bytes." },
        account: {
          type: 'string',
          description: 'Whose position this is — the account whose shares are read.',
        },
        receiver: {
          type: 'string',
          description: 'Who receives the TRUST. Usually the same as `account`.',
        },
        shares: {
          type: 'string',
          description: 'How many shares to redeem. Omit for the whole position.',
        },
        curve_id: {
          type: 'number',
          description: 'Which curve the position is on. Defaults to the chain default.',
        },
        min_assets: {
          type: 'string',
          description: 'Slippage floor in TRUST wei. Zero accepts any price.',
        },
      },
      required: ['term_id', 'account', 'receiver'],
    },
  },
  {
    name: 'arp_agent_endpoints',
    description:
      'Where another agent said it can be reached. Reads its ERC-8004 registration document and ' +
      'returns every endpoint it declared, split into CALLABLE (an http address you could send a ' +
      'request to) and NOT CALLABLE (a did:, a wallet, an email — an identifier with nowhere to ' +
      "send). It is the agent's own claim about itself: declared, not verified. Use " +
      '`arp_probe_endpoint` if you want to know whether one answers before you call it. ARP is ' +
      'not in the path of whatever you do next — you call it directly.',
    inputSchema: {
      type: 'object',
      properties: {
        agent_chain_id: { type: 'number', description: "The agent's ERC-8004 chain, e.g. 8453." },
        agent_token_id: { type: 'string', description: 'Its token id, as a decimal string.' },
        registry: {
          type: 'string',
          description: 'The registry address, when not the canonical one.',
        },
      },
      required: ['agent_chain_id', 'agent_token_id'],
    },
  },
  {
    name: 'arp_record_reachable',
    description:
      'Probe a tool and plan the position that records what you found. Returns unsigned calls you ' +
      'sign with YOUR key, so what lands is YOUR verdict — not ARP\'s. ARP\'s index reads one ' +
      "attestor's positions; everybody else's sit beside them, and a disagreement between them is " +
      'the signal to re-probe. That is what replaces an oracle here: the claim is reproducible, so ' +
      'a second observer costs one HTTP request and can contradict the first. ' +
      'One observation is enough, deliberately. The scheduled prober needs three consecutive ' +
      'failures before it condemns, because it judges somebody else\'s service from the outside ' +
      'and condemning takes an author\'s visibility away. You called the thing — you are reporting ' +
      'what happened to you, and three confirmations would be asking you to doubt it. ' +
      'A TLS failure, a DNS failure or a 429 is NOT a verdict and plans nothing: the first two ' +
      'could be your network and the third is the host asking you to stop. A timeout IS a verdict. ' +
      'An empty `calls` means nothing should change, which is the common case and not a failure — ' +
      'read `why`. The response carries the probe whole, including the exact request, so anyone ' +
      'can reproduce your verdict with one curl.',
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'The http(s) endpoint you called.' },
        tool_atom_id: {
          type: 'string',
          description: "The tool's atom id, 0x + 32 bytes. `arp_find_tools` returns them.",
        },
        receiver: {
          type: 'string',
          description: 'Your 0x address — the one that will hold the position and sign the calls.',
        },
        protocol: {
          type: 'string',
          description:
            "'mcp' or 'a2a' to attempt that protocol's handshake, which is the strongest check " +
            'available. Omitted does a plain reachability check.',
        },
      },
      required: ['url', 'tool_atom_id', 'receiver'],
    },
  },
  {
    name: 'arp_probe_endpoint',
    description:
      'Ask one endpoint whether it answers. Returns `confirmed` with a code (live, dead, ' +
      'serves-declared-protocol, declared-protocol-not-served), `not-checkable` when there was ' +
      'nothing to probe, or `inconclusive` when it answered something unrecognised or the ' +
      'transport failed in a way that could be our network. A timeout IS a verdict about the ' +
      'agent; a TLS or DNS failure is NOT, because it could equally be us; a 429 is never a ' +
      'verdict, it is the host asking us to stop. Every confirmed result carries the request so ' +
      'you can reproduce it with one curl. Requests are serialised per host.',
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'The http(s) endpoint to probe.' },
        protocol: {
          type: 'string',
          description:
            "'mcp' or 'a2a' to attempt that protocol's handshake, which is the strongest check " +
            'available. Omitted does a plain reachability check.',
        },
      },
      required: ['url'],
    },
  },
] as const;
