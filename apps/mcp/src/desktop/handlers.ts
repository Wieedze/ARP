/**
 * `arp_get_skill`, `arp_declare_used` and `arp_file_category` when `ARP_TOOLS` is `desktop` (the Claude Desktop extension)
 * or `sponsored` (Claude Code, `arp init --sponsored`).
 * The key is created the first time one of them is called, not when the server starts, so a user
 * who only searches never gets one.
 */
import { arpHome } from '@arp-protocol/core/node';
import { getAddress, type Hex } from 'viem';

import {
  CONTENT_URL,
  MULTI_VAULT,
  RECEIPTS_LOG,
  RPC,
  SKILLS_DIR,
  SPONSOR_URL,
  record,
} from '../config.js';
import { type JsonRpcId, fail, text } from '../rpc.js';
import { agentKeyPath, agentSender, loadOrCreateAgentKey, type AgentSender } from './agent-key.js';
import { fileCategory } from './file-category.js';
import { declareUsed, getSkill, type LoopConfig } from './loop.js';

let agent: AgentSender | undefined;

function config(): LoopConfig {
  const registry = record.arp?.identityRegistry;
  if (typeof registry !== 'string') throw new Error('this chain has no ARP identity registry');
  return {
    contentUrl: CONTENT_URL,
    sponsorUrl: SPONSOR_URL,
    registry: getAddress(registry),
    multiVault: getAddress(MULTI_VAULT),
    stateDir: arpHome(),
    ...(SKILLS_DIR === undefined ? {} : { skillsDir: SKILLS_DIR, projectReceipts: RECEIPTS_LOG }),
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
  if (name === 'arp_file_category') {
    const category = args['category'];
    if (typeof category !== 'string' || category.trim().length === 0) {
      return fail(id, -32602, 'category must be a category name');
    }
    const parent = typeof args['parent'] === 'string' ? args['parent'] : undefined;
    const reason = typeof args['reason'] === 'string' ? args['reason'] : undefined;
    return text(
      id,
      await fileCategory(
        {
          id: atom,
          category,
          ...(parent === undefined ? {} : { parent }),
          ...(reason === undefined ? {} : { reason }),
        },
        { sponsorUrl: SPONSOR_URL, fetch: globalThis.fetch.bind(globalThis) },
      ),
    );
  }
  const loop = config();
  try {
    if (name === 'arp_get_skill') {
      const skill = await getSkill(loop, agentFor(), atom as Hex); // checked to be 32 bytes of hex above
      return text(id, {
        name: skill.name,
        source: skill.url,
        skill_md: skill.text,
        ...(skill.installedAt === undefined
          ? {}
          : {
              installed_at: skill.installedAt,
              files: skill.files,
              note: 'Installed for this project, with its scripts: invoke it with the Skill tool from the next session.',
            }),
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
