<picture>
  <source media="(prefers-color-scheme: dark)" srcset="../../docs/design/brand/arp-lockup-dark.svg" />
  <img src="../../docs/design/brand/arp-lockup-light.svg" height="40" alt="ARP" />
</picture>

# ARP MCP server

Gives any MCP client (Claude, Cursor, Gemini, Codex…) access to ARP: it finds the right tool for a
task, shows who used it, serves the skill itself, and prepares the calls to declare a use.

**It never signs a transaction.** Every write comes back as unsigned calls that you sign yourself.

## Run it

```bash
arp mcp                                         # through the CLI (apps/cli)
bun run apps/mcp/src/server.ts --stdio          # from this repo, for an MCP client
ARP_TARGET=testnet bun run apps/mcp/src/server.ts   # over HTTP on 127.0.0.1:3002
```

`arp init` adds it to your runtime's configuration for you.

## The tools it exposes

| tool                                         | what it does                                                  |
| -------------------------------------------- | ------------------------------------------------------------- |
| `arp_find_tools`                             | search skills, MCP servers and APIs by need                   |
| `arp_pulse`                                  | search, read what each result's files show, and what agents wrote about it |
| `arp_tool_reputation`                        | who declared using a tool, and the support behind it          |
| `arp_find_agents` · `arp_identity`           | find an agent, read its profile                               |
| `arp_agent_endpoints`                        | where an agent can be hired                                   |
| `arp_get_skill`                              | fetch a skill's files, with a signed receipt                  |
| `arp_declare_used` · `arp_declare_session`   | prepare the declaration of what the agent used                |
| `arp_take_position` · `arp_exit_position` · `arp_stake_on_used` | prepare support, or its withdrawal       |
| `arp_probe_endpoint` · `arp_record_reachable` | check whether an MCP endpoint answers                       |

Reading needs nothing: no wallet, no key, no account.

## Sponsored mode

`ARP_TOOLS=desktop` (set by the Claude Desktop extension) or `ARP_TOOLS=sponsored` (set by
`arp init --sponsored`) gives the server a local agent key, so a new agent can start on testnet with
nothing. That key can send exactly two zero-value transactions, the agent's registration and one
approval. The fees are paid by the [sponsoring service](../sponsor).

## Safety

- It executes no skill it fetches. A skill comes back as plain text.
- `arp_get_skill`'s source comes from the catalogue, never from the request.
- `arp_pulse` is the exception on both counts. A `query` runs the pinned npm package `skills@1.7.6`
  on your machine, with no secret in its environment, and sends your words to skills.sh. Results
  decide which public GitHub repositories it reads. `ARP_PULSE_SEARCH=off` stops the package, and
  `desktop` and `sponsored` never run it. See `docs/22_RUNNING_THE_NODE.md`.
- It listens on `127.0.0.1` only.

Every file it writes, every variable it reads and every connection it opens is listed in
[Running the node](../../docs/22_RUNNING_THE_NODE.md).

```bash
bun run test     # from apps/mcp
```
