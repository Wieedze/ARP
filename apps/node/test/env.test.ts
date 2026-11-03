import { describe, expect, test } from 'bun:test';
import { parseEther } from 'viem';

import { minBudgetFrom, portFrom } from '../src/env.ts';

describe('the node environment', () => {
  test('a port is 1 to 65535, else the start fails with the variable named', () => {
    expect(portFrom(undefined, 3100)).toBe(3100);
    expect(portFrom('4000', 3100)).toBe(4000);
    for (const bad of ['abc', '0', '70000', '-1', '3100.5']) {
      expect(() => portFrom(bad, 3100)).toThrow(/AGENT_NODE_PORT/);
    }
  });

  test('a minimum budget is a non-negative decimal', () => {
    expect(minBudgetFrom(undefined, '0.001')).toBe(parseEther('0.001'));
    expect(minBudgetFrom('0.5', '0.001')).toBe(parseEther('0.5'));
    for (const bad of ['-1', 'abc', '1e18', '0.1.2']) {
      expect(() => minBudgetFrom(bad, '0.001')).toThrow(/AGENT_NODE_MIN_BUDGET/);
    }
  });
});
