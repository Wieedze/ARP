import { getToolUsage } from '@arp-protocol/core';

import { GRAPHQL } from '../config.js';
import { type JsonRpcId, fail, text, isTermId } from '../rpc.js';
import { serialise } from '../serialise.js';

export async function toolReputation(id: JsonRpcId, args: Record<string, unknown>) {
  const toolAtomId = args['tool_atom_id'];
  if (!isTermId(toolAtomId)) {
    return fail(id, -32602, 'tool_atom_id must be a 0x-prefixed 32-byte hex string');
  }
  const attestedBy = typeof args['attested_by'] === 'string' ? args['attested_by'] : undefined;
  const usage = await getToolUsage(toolAtomId, {
    graphqlUrl: GRAPHQL,
    ...(attestedBy === undefined ? {} : { attestedBy }),
  });
  return text(id, serialise(usage));
}
