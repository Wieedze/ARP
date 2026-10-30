/**
 * The verdict of `arp status`, one per tool: the first rule that applies.
 *
 * | verdict | condition |
 * | --- | --- |
 * | `not enough data` | fewer than 10 calls from this agent, or fewer than 3 other operators in the network reading |
 * | `broken everywhere` | network success under 75 % and this agent's under 75 % |
 * | `only you: check config` | network at least 90 %, this agent more than 20 points below. `check credentials` when more than half its failures are `auth` |
 * | `changed <date>` | a change of functions, host or price in the last 7 days |
 * | `slow for you` | this agent's median duration over twice the network's |
 * | `ok` | none of the above |
 *
 * ARP grades nobody (ADR `0046`): the network figures are an average of what other agents
 * published, with their count, and a verdict compares this machine with that average. The
 * thresholds are starting values, to be revisited after the first ten users.
 *
 * Until the network reading exists (week 3 of the v0), `network` is `null`, so every tool reads
 * `not enough data` and the `you` column carries the information. That is the spec's rule, kept
 * literally rather than inventing a verdict from local data alone.
 */
export const THRESHOLDS = {
  minCalls: 10,
  minOperators: 3,
  broken: 0.75,
  networkHealthy: 0.9,
  gapPoints: 0.2,
  slowFactor: 2,
  changedDays: 7,
} as const;

export type NetworkReading = {
  /** Success rate published by other agents for the same atom, past week, 0 to 1. */
  success: number;
  /** Distinct operators behind it. */
  operators: number;
  medianMs: number | null;
};

export type LocalStats = {
  calls: number;
  ok: number;
  auth: number;
  medianMs: number | null;
  /** The most recent change in the window, ISO date, or `null`. */
  lastChange: string | null;
};

export type Verdict =
  | { kind: 'not enough data' }
  | { kind: 'broken everywhere' }
  | { kind: 'only you'; hint: 'check config' | 'check credentials' }
  | { kind: 'changed'; on: string }
  | { kind: 'slow for you' }
  | { kind: 'ok' };

export function verdictFor(local: LocalStats, network: NetworkReading | null, now: Date): Verdict {
  if (
    local.calls < THRESHOLDS.minCalls ||
    network === null ||
    network.operators < THRESHOLDS.minOperators
  ) {
    return { kind: 'not enough data' };
  }
  const you = local.ok / local.calls;
  if (network.success < THRESHOLDS.broken && you < THRESHOLDS.broken)
    return { kind: 'broken everywhere' };
  if (
    network.success >= THRESHOLDS.networkHealthy &&
    network.success - you > THRESHOLDS.gapPoints
  ) {
    const failures = local.calls - local.ok;
    return {
      kind: 'only you',
      hint: failures > 0 && local.auth / failures > 0.5 ? 'check credentials' : 'check config',
    };
  }
  if (local.lastChange !== null) {
    const age = now.getTime() - new Date(local.lastChange).getTime();
    if (age <= THRESHOLDS.changedDays * 86_400_000)
      return { kind: 'changed', on: local.lastChange.slice(0, 10) };
  }
  if (
    local.medianMs !== null &&
    network.medianMs !== null &&
    local.medianMs > THRESHOLDS.slowFactor * network.medianMs
  ) {
    return { kind: 'slow for you' };
  }
  return { kind: 'ok' };
}

export function verdictText(verdict: Verdict): string {
  switch (verdict.kind) {
    case 'only you':
      return `only you: ${verdict.hint}`;
    case 'changed':
      return `changed ${verdict.on}`;
    default:
      return verdict.kind;
  }
}

/** How urgent a verdict is, for sorting `arp status`: the first rows are the ones to act on. */
export function urgency(verdict: Verdict): number {
  switch (verdict.kind) {
    case 'broken everywhere':
      return 0;
    case 'only you':
      return 1;
    case 'changed':
      return 2;
    case 'slow for you':
      return 3;
    case 'ok':
      return 4;
    case 'not enough data':
      return 5;
  }
}
