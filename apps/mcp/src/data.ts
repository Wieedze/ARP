/** Every chain's records, imported so a bundle carries them (ADR `0082`).
 *
 *  Keyed by chain id and looked up by the chain a process was started on, which is what
 *  `rules/portability.md` rule 1 asks for: the constant that is forbidden is one chain's record at
 *  module scope, read whatever the target. A chain absent from a map is a chain with no record.
 */
import type { CataloguedSkill } from './content.js';

import deployment1155 from '../../../deployments/1155.json';
import deployment13579 from '../../../deployments/13579.json';
import skills13579 from '../../../catalogue/skills-13579.json';

export const DEPLOYMENTS: Readonly<Record<number, unknown>> = {
  1155: deployment1155,
  13579: deployment13579,
};

// No `skills-1155.json`: no skill was seeded on mainnet, so a mainnet server knows none.
export const SKILL_CATALOGUES: Readonly<Record<number, { skills?: CataloguedSkill[] }>> = {
  13579: skills13579,
};
