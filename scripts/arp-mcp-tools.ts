/** The tools ARP's MCP server serves. Data, not transport.
 *
 *  Its own module so it can be imported without pulling in the server's Bun runtime: the connector's
 *  tests assert the rig's declared capabilities against this list, and `erc8004` must typecheck
 *  without `@types/bun`, which is installed nowhere in this repo (`tasks/21`).
 *
 *  A fixture declaring a tool this list does not contain is a `declared ≠ served` mismatch the
 *  verifier would report — against ARP's own rig. That nearly shipped once.
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
] as const;
