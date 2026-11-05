import { type PulseSource, readPulse, type SkillPulse, type SkillSearchResult } from '@arp-protocol/core';

const BATCH = 4;

/** Results that give the person something to decide on: one per content, and each file read alone. */
function usable(pulses: readonly SkillPulse[], setAside: (pulse: SkillPulse) => boolean): number {
  const contents = new Set<string>();
  let alone = 0;
  for (const pulse of pulses) {
    if (setAside(pulse)) continue;
    if (pulse.status === 'read') contents.add(pulse.contentId);
    if (pulse.status === 'read_file_only') alone += 1;
  }
  return contents.size + alone;
}

/**
 * Read a search's results within what GitHub allows.
 *
 * With a token, every result in the window, as it always was: the copies in other repositories come from those
 * extra reads. Without one, only until there are `limit` usable results, because the window alone
 * could spend 30 of the 60 requests an address has in an hour, and a person stopped after a few searches
 * (`docs/tasks/70`). What that gives up is said in `docs/22`: fewer copies are seen.
 */
export async function readWindow(
  results: readonly SkillSearchResult[],
  source: PulseSource,
  options: {
    limit: number;
    hasToken: boolean;
    setAside: (pulse: SkillPulse) => boolean;
  },
): Promise<SkillPulse[]> {
  const window = results.slice(0, Math.min(options.limit * 3, 30));
  const pulses: SkillPulse[] = [];
  for (let at = 0; at < window.length; ) {
    const size = options.hasToken ? BATCH : Math.max(1, Math.min(BATCH, options.limit - usable(pulses, options.setAside)));
    const batch = window.slice(at, at + size);
    pulses.push(
      ...(await Promise.all(
        batch.map((result) =>
          readPulse(result, source).catch((): SkillPulse => ({ ...result, status: 'repository_unreachable' })),
        ),
      )),
    );
    at += batch.length;
    if (!options.hasToken && usable(pulses, options.setAside) >= options.limit) break;
  }
  return pulses;
}
