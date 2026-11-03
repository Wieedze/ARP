/** The node's numeric settings, read from the environment and refused at start when malformed.
 *
 *  Until ADR `0116` `AGENT_NODE_PORT` went through `Number()`, so `abc` listened on `NaN`, and
 *  `AGENT_NODE_MIN_BUDGET` through `parseEther`, which reads `-1` as a negative floor and threw
 *  a bare viem error on anything that was not a number.
 */
import { parseEther } from 'viem';

/** A TCP port, 1 to 65535. */
export function portFrom(raw: string | undefined, fallback: number): number {
  if (raw === undefined || raw.trim() === '') return fallback;
  const port = Number(raw);
  if (!/^[0-9]+$/.test(raw.trim()) || port < 1 || port > 65_535) {
    throw new Error(`AGENT_NODE_PORT must be a port between 1 and 65535, got ${raw}`);
  }
  return port;
}

/** A non-negative decimal amount in the chain's native unit, as wei. */
export function minBudgetFrom(raw: string | undefined, fallback: string): bigint {
  const value = raw === undefined || raw.trim() === '' ? fallback : raw.trim();
  if (!/^(0|[1-9][0-9]*)(\.[0-9]{1,18})?$/.test(value)) {
    throw new Error(`AGENT_NODE_MIN_BUDGET must be a decimal amount such as 0.001, got ${value}`);
  }
  return parseEther(value);
}
