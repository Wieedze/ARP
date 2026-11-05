/**
 * Writing one line from this machine: `arp line`, and what `arp share` calls (ADR `0144`). Kept out of the
 * MCP server's tools on purpose: a server that holds an agent key does not run the search package
 * (`handlers/pulse.ts`, `canSearch`), so the plugin's server stays read-only and holds no key, and this holds
 * it for the length of one call.
 */
import { isUsageOutcome, isUsageReason, USAGE_REASONS } from '@arp-protocol/core';

import { chainId } from './config.js';
import { agentFor, loopConfig } from './desktop/handlers.js';
import { writeLine, type LineInput, type WrittenLine } from './desktop/loop.js';

/** A command line's strings as a line, or what is wrong with them. Closed words only. */
export function lineFromArgs(args: {
  toolUrl: string;
  outcome: string;
  domain: string | undefined;
  reason: string | undefined;
}): LineInput | Error {
  if (!isUsageOutcome(args.outcome)) return new Error('--outcome must be worked or failed');
  if (args.reason !== undefined && !isUsageReason(args.reason)) {
    return new Error(`--reason must be one of ${USAGE_REASONS.join(', ')}`);
  }
  if (args.reason !== undefined && args.outcome !== 'failed') return new Error('a reason only follows --outcome failed');
  return {
    toolUrl: args.toolUrl,
    outcome: args.outcome,
    ...(args.domain === undefined ? {} : { domain: args.domain }),
    ...(args.reason === undefined ? {} : { reason: args.reason }),
  };
}

/** Testnet 13579 only (ADR `0135`, `0144`). */
export async function writeLineHere(input: LineInput): Promise<WrittenLine> {
  if (chainId !== 13579) throw new Error('a line is written on testnet 13579 only for now');
  return writeLine(loopConfig(), agentFor(), input);
}
