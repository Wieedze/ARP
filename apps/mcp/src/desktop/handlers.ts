/**
 * `arp_get_skill` and `arp_declare_used` when `ARP_TOOLS` is `desktop` (the Claude Desktop extension)
 * or `sponsored` (Claude Code, `arp init --sponsored`).
 * The key is created the first time one of them is called, not when the server starts, so a user
 * who only searches never gets one.
 */
import { dirname, join } from 'node:path';

import { skillRefFromUrl } from '@arp-protocol/core';
import { arpHome } from '@arp-protocol/core/node';
import { getAddress, type Hex } from 'viem';

import skillFacts from '../../../../data/catalogue/skill-facts.json';
import { askPerson } from '../client-session.js';
import { SKILL_PINS } from '../data.js';
import { keyOf } from '../tool-search.js';
import type { ReviewContext } from './skill-gate.js';

import { CONTENT_URL, MULTI_VAULT, RECEIPTS_LOG, RPC, SKILLS_DIR, SPONSOR_URL, record } from '../config.js';
import { type JsonRpcId, fail, text } from '../rpc.js';
import { agentKeyPath, agentSender, DESKTOP_CHAIN_ID, loadOrCreateAgentKey, type AgentSender } from './agent-key.js';
import { declareUsed, getSkill, type LoopConfig } from './loop.js';

let agent: AgentSender | undefined;

// The shape of a committed file `scripts/build/build-skill-facts.ts` generates.
const INSTALLS = new Map(
  Object.entries(skillFacts.facts as Record<string, { installs: number | null }>).map(([label, fact]) => [keyOf(label), fact.installs]),
);

/** The commit's date from the pin record, and skills.sh's install count with its date. */
function reviewContext(url: string): ReviewContext {
  const ref = skillRefFromUrl(url);
  const pinned = ref === null ? undefined : SKILL_PINS[DESKTOP_CHAIN_ID]?.repos[ref.repo];
  const installs = INSTALLS.get(keyOf(url));
  return {
    committedAt: pinned?.committedAt ?? null,
    thirdParty:
      installs === undefined || installs === null
        ? []
        : [{ label: 'installs', value: installs.toLocaleString('en-US'), source: 'skills.sh', readOn: skillFacts._measuredOn }],
  };
}

function config(): LoopConfig {
  const registry = record.arp?.identityRegistry;
  if (typeof registry !== 'string') throw new Error('this chain has no ARP identity registry');
  return { contentUrl: CONTENT_URL, sponsorUrl: SPONSOR_URL, registry: getAddress(registry), multiVault: getAddress(MULTI_VAULT), stateDir: arpHome(),
    ...(SKILLS_DIR === undefined
      ? {}
      : {
          skillsDir: SKILLS_DIR,
          projectReceipts: RECEIPTS_LOG,
          pendingDir: join(dirname(RECEIPTS_LOG), 'pending'),
          ask: askPerson,
          reviewContext,
        }),
  };
}

function agentFor(): AgentSender {
  agent ??= agentSender(loadOrCreateAgentKey(agentKeyPath()), RPC);
  return agent;
}

export async function desktopTool(id: JsonRpcId, name: string, args: Record<string, unknown>) {
  const atom = args['id'];
  if (typeof atom !== 'string' || !/^0x[0-9a-fA-F]{64}$/.test(atom)) {
    return fail(id, -32602, 'id must be the 0x + 32 bytes id from arp_find_tools');
  }
  const loop = config();
  try {
    if (name === 'arp_get_skill') {
      const skill = await getSkill(loop, agentFor(), atom as Hex); // checked to be 32 bytes of hex above
      return text(id, {
        name: skill.name,
        source: skill.url,
        skill_md: skill.text,
        ...(skill.installedAt !== undefined
          ? {
              installed_at: skill.installedAt,
              files: skill.files,
              note: 'The person accepted it. Installed for this project, with its scripts: invoke it with the Skill tool from the next session.',
            }
          : skill.declined === true
            ? { installed: false, note: 'The person was shown the facts page and did not accept. Nothing was installed; do not retry unless they ask.' }
            : skill.pendingAt !== undefined
              ? {
                  installed: false,
                  pending_at: skill.pendingAt,
                  note: `Nothing was installed: this client cannot ask the person directly. Tell them to run \`arp skills accept ${skill.name}\` in their own terminal; it shows the facts and asks. You cannot answer it for them.`,
                }
              : {}),
      });
    }
    const done = await declareUsed(loop, agentFor(), atom as Hex); // checked to be 32 bytes of hex above
    return text(id, {
      declared: done.skill,
      supported_by: 'ARP, in your name',
      note: 'Public now. Nothing was asked of the person and nothing was charged.',
    });
  } catch (error) {
    return text(id, { error: error instanceof Error ? error.message : String(error) });
  }
}
