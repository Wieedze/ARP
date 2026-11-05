/** The tools ARP's MCP server serves. Data, not transport.
 *
 *  Its own module so it can be imported without pulling in the server's Bun runtime: the connector's
 *  tests assert the rig's declared capabilities against this list, and `@arp-protocol/core` must
 *  typecheck without `@types/bun`, which is installed nowhere in this repo (`docs/tasks/21`).
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
      "Whether an agent's identity is public yet — the record every declaration it makes is " +
      "attached to. Ask this first: the record is written by Intuition's mirror, and measured " +
      '2026-10-20 the mirror holds 28,648 against a Base registry whose highest minted id is ' +
      '309,925 — so for about nine agents in ten the answer is no, and every other tool here fails ' +
      'for them until it is yes. A read; it reports the gap rather than closing it, because closing ' +
      'it is a write. The ids it returns are computable from your identity alone, with no API key.',
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
      'Agents listed in the ARP registry, a page at a time. `evidence-quantity` orders them by how ' +
      'many public statements exist about each, `economic-conviction` by how much people put ' +
      'behind it. Neither is a score: ARP rates nobody. `total` is the size of the whole list, ' +
      'not of this page. An agent linked to more than one identity comes back as ambiguous ' +
      'rather than resolved to one of them.',
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
      'Search the ARP registry for a skill, a tool, an MCP server or an API that fits a need, ' +
      'BEFORE you pick one yourself or search the web. Pass `query`, a few words for the need ' +
      '("video editing", "convert web page to markdown"): a result holds every word, or all but ' +
      'one from three words on, and those holding every word come first. Or pass `domain`, ' +
      'one broad word (`marketing`, `payment`), or both. Each result is short: `name`, `purpose` (one sentence), `url` (the source to read ' +
      'before you use it, not something to call), `declarations` (how many agents said they used ' +
      'it) and, for a skill, `installs` and, when its file shows one, `requires`: the CLI it ' +
      'declares, the commands its instructions run and a login line it mentions. Read `requires` ' +
      'before you pick: a skill that needs a program or an account the person does not have is ' +
      'not the right one, so check for the program first. `file_not_read` means nobody read its ' +
      'file, so what it needs is unknown. `not_fetchable` means `arp_get_skill` will refuse it, so ' +
      'pick another. Results come best match first, 25 at a time: when ' +
      '`next_offset` is not null, pass it as `offset` to see more. If a `domain` matches ' +
      'nothing, `domains_available` lists the words the registry uses. ' +
      '`detail: "full"` adds everything else the registry holds about each result. `id` is what ' +
      '`arp_tool_reputation` takes. An empty result means the registry has nothing for that need, ' +
      'not that nothing exists: answer from what you know rather than searching it again.',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description:
            'A few words for the need, in any language the descriptions use (mostly English): ' +
            '"video editing", "pdf form", "transcription". A result holds every word in its name ' +
            'or its description, or all but one from three words on.',
        },
        domain: {
          type: 'string',
          description:
            'One lowercase word for the need: `marketing`, `payment`, `database`, `design`. Ask ' +
            'for the broad word: narrower kinds are found under it, so `payment` also finds a ' +
            'tool filed under `card`. `domains_walked` in the answer shows which. Omit it to list ' +
            'everything. The registry read is fixed by the server, not by the caller ' +
            '(`domain_attestors` names them).',
        },
        order: {
          type: 'string',
          enum: ['priced-edges', 'conviction', 'declarations'],
          description:
            'Sort by backed declarations, by the amount behind them, or by how many there are. ' +
            'None is a score. Defaults to priced-edges. With a `query`, best match comes first.',
        },
        limit: { type: 'number', description: '1 to 100. Defaults to 25.' },
        offset: {
          type: 'number',
          description: 'Where the page starts. Pass the `next_offset` of the previous answer.',
        },
        detail: {
          type: 'string',
          enum: ['short', 'full'],
          description:
            'Defaults to short. `full` adds the backing behind each result, its pricing curve and ' +
            'where each figure was read, at about twice the length.',
        },
        curve_id: {
          type: 'number',
          description:
            'Advanced. Which pricing curve the amounts are read at; defaults to the chain ' +
            'default, 1. Curves are separate markets holding different amounts, so name the one ' +
            'you mean. Leave it out unless you know you need it.',
        },
      },
      required: [],
    },
  },
  {
    name: 'arp_pulse',
    description:
      'Before installing a skill: search with `npx skills find` and read what each result implies, from its own ' +
      'files, with what agents wrote about it. Pass `query`, a few words for the need. In a host where ' +
      '`npx` does not run, pass the command\'s text as `search_output`. Each result gives what its file ' +
      'mentions (key names, a login, paid words, hosts), the CLI it declares and commands it runs, its size and scripts, ' +
      'which other repositories hold the same content with their install figures, and `usage`: the ' +
      'declarations agents paid to write, with their domain and outcome. `status` other than `read` means ' +
      'it was not read, so what it needs is unknown. Pass `constraints` to set aside what does not ' +
      'fit the person; they stay in this call. Pass `domain` to order by declarations in that domain. ' +
      'Nothing here is a verdict, and nothing is written.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'A few words for the need: "video editing".' },
        search_output: {
          type: 'string',
          description: 'The text of `npx skills find <query>`, when this host cannot run it. Replaces `query`.',
        },
        domain: {
          type: 'string',
          description: 'One category word, `video`. Orders by declarations in it, then by the search.',
        },
        constraints: {
          type: 'object',
          description: 'What this person cannot or will not accept. Stays local.',
          properties: {
            no_keys: { type: 'boolean', description: 'Set aside a file that mentions an API key or a token.' },
            no_login: { type: 'boolean', description: 'Set aside a file that mentions a login or a sign-up.' },
            no_paid: { type: 'boolean', description: 'Set aside a file that mentions pricing, credits or billing.' },
            no_scripts: { type: 'boolean', description: 'Set aside a skill that ships scripts.' },
            have_commands: {
              type: 'array',
              items: { type: 'string' },
              description: 'The commands this machine has. A skill naming another one is set aside.',
            },
          },
        },
        limit: { type: 'number', description: 'Distinct contents to return, 1 to 20. Defaults to 5.' },
      },
      required: [],
    },
  },
  {
    name: 'arp_tool_reputation',
    description:
      'Who declared using one tool, and how strongly. Returns each declaration with the agent ' +
      'that made it, the amount behind it and the amount against it, plus totals. Read an ' +
      'amount with how many supports make it up: one large amount can come from a single account.',
    inputSchema: {
      type: 'object',
      properties: {
        tool_atom_id: {
          type: 'string',
          description: 'The `tool_atom_id` that `arp_find_tools` returned (0x + 32 bytes).',
        },
        attested_by: {
          type: 'string',
          description:
            'Optional. Keep only declarations this account backs. A filter, never a claim that ' +
            'nobody else does (ADR 0034).',
        },
      },
      required: ['tool_atom_id'],
    },
  },
  {
    name: 'arp_declare_used',
    description:
      'Plan the public declaration that an agent used a set of tools. Returns unsigned ' +
      'calls — ARP holds no key and sends nothing; you sign them with yours, in the order ' +
      'given. Each declaration is attached to your ERC-8004 identity and worded with the shared ' +
      "`uses` term, so anyone following Intuition's partner guide can read it. Needs no API key. " +
      'Each declaration costs a fee in TRUST that does NOT come back: check `total_value_wei` ' +
      'before signing.',
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
        registry: {
          type: 'string',
          description:
            'Optional. The identity registry, when it is not the canonical one. Needed on any ' +
            'chain where that address has no code — it has none on Intuition testnet 13579.',
        },
        tools: {
          type: 'array',
          items: { type: 'string' },
          description:
            "Canonical tool URIs — a schema URI, an MCP endpoint, an `ipfs://` document. The tool's " +
            'id derives from the URI, so nothing is pinned and no credential is needed.',
        },
        domain: {
          type: 'string',
          description:
            'Optional. The category this use was in, one existing word such as `video`. Never the ' +
            "text of a request. One more paid triple per tool, so other agents can read it in context.",
        },
        outcome: {
          type: 'string',
          enum: ['worked', 'failed'],
          description:
            'Optional. How this use went, in your own name. One more paid triple per tool. ' +
            'It is your word about your use and never a verdict on the tool.',
        },
      },
      required: ['agent_chain_id', 'agent_token_id', 'tools'],
    },
  },
  {
    name: 'arp_declare_session',
    description:
      "Plan the declaration of what THIS SESSION actually invoked, from the runtime hook's own " +
      'log rather than from what you remember. Returns unsigned calls — ARP holds no key and ' +
      'sends nothing. It plans ONLY for invocations it can name exactly: a skill name is ' +
      'carried by several repositories (104 of 499 in the catalogue), so an ambiguous one is ' +
      'reported with every candidate and gets no call. Where you fetched the tool through a ' +
      'server, the response also says whether a receipt corroborates the access and who signed ' +
      'it. A receipt attests ACCESS, never use.',
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
        registry: {
          type: 'string',
          description:
            'Optional. The identity registry, when it is not the canonical one. Needed on any ' +
            'chain where that address has no code — it has none on Intuition testnet 13579.',
        },
        log: {
          type: 'string',
          description:
            "The hook's JSONL log. Omit it to read `.arp/session.jsonl`, which is where " +
            '`apps/hook/src/hook.ts` writes by default.',
        },
        declarer: {
          type: 'string',
          description:
            'The address that will sign the calls. Used only to read a receipt: a receipt ' +
            'signed by this same address corroborates nobody, and the response says so.',
        },
      },
      required: ['agent_chain_id', 'agent_token_id'],
    },
  },
  {
    name: 'arp_stake_on_used',
    description:
      'Plan support in TRUST for declarations that are already public. Returns unsigned calls; ' +
      'you sign and send them. An entry fee comes off; the rest buys shares of the market at ' +
      "today's price, held by the receiver. Withdrawing returns what they are worth then, less " +
      'an exit fee, so the TRUST is at risk. The support lands on the DECLARATION, not on the tool itself: the ' +
      'declaration is the one YOU made, so a reader can attribute the support back to you, and ' +
      'it is what tool reputation reads. Supporting the tool itself is `arp_take_position`, open ' +
      'to anyone. A declaration that is not public yet is reported with `exists: false` and gets ' +
      'no call.',
    inputSchema: {
      type: 'object',
      properties: {
        receiver: {
          type: 'string',
          description:
            'Who will hold the support. Your own account when you spend your own TRUST; under a ' +
            'permission, the account that granted it and whose TRUST is spent. Not defaulted — ' +
            'guessing gives the support to the wrong party.',
        },
        curve_id: {
          type: 'number',
          description:
            'Advanced. Which pricing curve the support goes on. Defaults to the chain default, 1, ' +
            'and the default is not the interesting curve. Measured on mainnet 2026-10-20: curve 1 ' +
            '"Linear Curve" holds 26.20 TRUST at a price of 1.000-1.060; curve 2 "Offset ' +
            'Progressive Curve" holds 219.54 TRUST at 3.000-4.181. Support that can grow in value ' +
            'has to ask for curve 2. The two are different markets, not two views of one.',
        },
        targets: {
          type: 'array',
          description: 'The declarations to support, each with the amount in wei as a string.',
          items: {
            type: 'object',
            properties: {
              triple_id: {
                type: 'string',
                description:
                  "The declaration's id, 0x + 32 bytes — `triple_id` in `arp_declare_used`'s answer.",
              },
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
      'Plan support in TRUST for a tool or an agent itself — not for a declaration about it. ' +
      'Returns unsigned calls; you sign and send them. An entry fee comes off; the rest buys ' +
      "shares of the market at today's price, held by the receiver. Withdrawing returns what " +
      'they are worth then, less an exit fee, so the TRUST is at risk. This is a different act ' +
      'from `arp_stake_on_used`: that one supports the declaration you made, which is ' +
      'attributable to you; this one supports the tool or agent itself, which anyone may do for ' +
      'any reason. The two are never summed. Support can be withdrawn with `arp_exit_position` ' +
      '— support nobody can withdraw is a donation.',
    inputSchema: {
      type: 'object',
      properties: {
        term_id: {
          type: 'string',
          description:
            'The id of the tool or agent, 0x + 32 bytes — `tool_atom_id` from `arp_find_tools`, ' +
            'or `identity_atom` from `arp_identity`.',
        },
        amount_wei: {
          type: 'string',
          description:
            'TRUST in wei. Must be at least the smallest amount the chain accepts (minDeposit), ' +
            'which is READ per plan and ' +
            'is 10x apart between chains: 0.01 TRUST on mainnet 1155 against 0.001 on testnet ' +
            '13579. An amount tuned on testnet is a tenth of the mainnet floor.',
        },
        receiver: {
          type: 'string',
          description:
            'Who will hold the support. Your own account when you spend your own TRUST; under a ' +
            'permission, the account that granted it and whose TRUST is spent. Not defaulted — ' +
            'guessing gives the support to the wrong party.',
        },
        curve_id: {
          type: 'number',
          description:
            'Advanced. Which pricing curve. Defaults to the chain default, 1, and the default is ' +
            'not the interesting curve. Measured on mainnet 2026-10-20: curve 1 is priced at ' +
            '1.000-1.060, curve 2 at 3.000-4.181. Two different markets, not two views of one.',
        },
        min_shares: {
          type: 'string',
          description:
            'Protection against the price moving: the fewest shares you accept for the amount. ' +
            'Zero accepts any price, which between planning and signing is how support buys less ' +
            'than it was quoted.',
        },
      },
      required: ['term_id', 'amount_wei', 'receiver'],
    },
  },
  {
    name: 'arp_exit_position',
    description:
      'Plan withdrawing support from a tool or an agent, back into TRUST. Returns unsigned ' +
      'calls; you sign and send them. This call sends NO value — it is the only one on this ' +
      'server that does not. Omit `shares` to withdraw all of it. What you get back is READ ' +
      'from the chain before you sign, never computed: the exit fee is a governance parameter ' +
      'and the price does not move in a straight line on curve 2.',
    inputSchema: {
      type: 'object',
      properties: {
        term_id: { type: 'string', description: 'The id of the tool or agent, 0x + 32 bytes.' },
        account: {
          type: 'string',
          description: 'Whose support this is — the account it is read from.',
        },
        receiver: {
          type: 'string',
          description: 'Who receives the TRUST. Usually the same as `account`.',
        },
        shares: {
          type: 'string',
          description:
            'How much to withdraw, in shares as `arp_take_position` reported them. Omit for all.',
        },
        curve_id: {
          type: 'number',
          description: 'Which pricing curve the support is on. Defaults to the chain default.',
        },
        min_assets: {
          type: 'string',
          description:
            'Protection against the price moving: the least TRUST, in wei, you accept back. Zero ' +
            'accepts any price.',
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
      "send). It is the agent's own word about itself: declared, not verified. Use " +
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
      'Probe a tool and plan the support that records what you found. Returns unsigned calls you ' +
      "sign with YOUR key, so what lands is YOUR verdict — not ARP's. ARP's index reads one " +
      "publisher's support; everybody else's sits beside it, and a disagreement between them is " +
      'the signal to re-probe. That is what replaces an oracle here: the finding is reproducible, so ' +
      'a second observer costs one HTTP request and can contradict the first. ' +
      'One observation is enough, deliberately. The scheduled prober needs three consecutive ' +
      "failures before it condemns, because it judges somebody else's service from the outside " +
      "and condemning takes an author's visibility away. You called the thing — you are reporting " +
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
          description: "The tool's id, 0x + 32 bytes — `tool_atom_id` in `arp_find_tools`.",
        },
        receiver: {
          type: 'string',
          description: 'Your 0x address — the one that will hold the support and sign the calls.',
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

/**
 * The Claude Desktop extension's own two tools (`ARP_TOOLS=desktop`, task 50). Worded for a user
 * who is not to see a wallet, a key or a fee (`docs/tasks/50` §3b): ARP pays, and nothing is asked
 * of them.
 */
export const DESKTOP_TOOLS = [
  {
    name: 'arp_get_skill',
    description:
      'Get a skill found with `arp_find_tools`: returns its SKILL.md, the instructions to follow to ' +
      'use it. Pass the `id` from the search result. Read it and follow it; it may ask you to run ' +
      'commands, so tell the person what it will do first. ARP keeps a note that this skill was ' +
      'served to you, which `arp_declare_used` needs.',
    inputSchema: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          description: "The skill's `id` from `arp_find_tools`, 0x + 32 bytes.",
        },
      },
      required: ['id'],
    },
  },
  {
    name: 'arp_declare_used',
    description:
      'After a skill from `arp_get_skill` actually helped with the task, record publicly that you ' +
      'used it, so others can see which skills get used. ARP pays for it and supports the record in ' +
      'your name; nothing is asked of the person. Only for a skill you used, never for one you only ' +
      'read. The first time takes about a minute.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'The `id` you passed to `arp_get_skill`.' },
      },
      required: ['id'],
    },
  },
] as const;

export const DESKTOP_TOOL_NAMES: ReadonlySet<string> = new Set(
  DESKTOP_TOOLS.map((tool) => tool.name),
);

/**
 * What a server started with `ARP_TOOLS=read` serves: the reads, and nothing that plans a write.
 *
 * The operators task 45 is for were promised a registry to search, and every tool outside this list
 * talks about wallets, identities and stakes. Serving them anyway puts that vocabulary in front of
 * an agent whose operator never asked for it.
 *
 * `GET /content/:atomId` is not a tool and stays served in this mode, on purpose: it is how an agent
 * fetches a skill it found (task 45b'). It signs a receipt for having served the bytes, which is
 * a record of access and moves no value (ADR `0080`).
 */
export const READ_TOOL_NAMES: ReadonlySet<string> = new Set([
  'arp_find_agents',
  'arp_find_tools',
  'arp_pulse',
  'arp_tool_reputation',
]);
