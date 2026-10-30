import { describe, expect, test } from 'bun:test';

import { redact } from '../src/capture.ts';

/** The verifier's probes on the first version, each of which leaked. */
describe('redact', () => {
  test('a URL keeps its scheme and host only: no password, path or token', () => {
    const out = JSON.stringify(
      redact({ mcp_server_url: 'https://user:SECRETPASS@host.io/p/SECRET?token=SECRET' }),
    );
    expect(out).not.toContain('SECRET');
    expect(out).toContain('https://host.io');
  });

  test('a naming key below the top level is redacted, whatever its container', () => {
    const out = JSON.stringify(
      redact({ arguments: { name: 'SECRET-N', type: 'SECRET-T', status: 'SECRET-S' } }),
    );
    expect(out).not.toContain('SECRET');
  });

  test('a top-level array is redacted like any deeper value', () => {
    expect(JSON.stringify(redact([{ name: 'SECRET' }]))).not.toContain('SECRET');
  });

  test('numbers inside content become <number>', () => {
    const out = JSON.stringify(
      redact({ tool_response: { card: 4111111111111111, balance: 98765 } }),
    );
    expect(out).not.toContain('4111111111111111');
    expect(out).not.toContain('98765');
  });

  test('a key that looks like data is replaced; a field name is kept', () => {
    const out = redact({
      tool_input: { 'sk-live-SECRETKEY': 1, 'alice@corp.com': 'x', repo: 'SECRET-R' },
    });
    const text = JSON.stringify(out);
    expect(text).not.toContain('SECRET');
    expect(text).not.toContain('alice');
    expect(text).toContain('"repo"');
  });

  test('a credential used as a key is replaced even when it looks like an identifier', () => {
    const out = JSON.stringify(
      redact({
        tool_input: { AKIAIOSFODNN7EXAMPLE: 1, ghp_0123456789abcdefghijABCDEFGHIJ012345: 2 },
      }),
    );
    expect(out).not.toContain('AKIA');
    expect(out).not.toContain('ghp_');
  });

  test('the top-level names an adapter reads are kept, and so are top-level numbers and booleans', () => {
    expect(
      redact({
        hook_event_name: 'PostToolUse',
        tool_name: 'mcp__github__list',
        tool_use_id: 't1',
        duration_ms: 12,
        is_interrupt: false,
        cwd: '/home/someone/secret-project',
      }),
    ).toEqual({
      hook_event_name: 'PostToolUse',
      tool_name: 'mcp__github__list',
      tool_use_id: 't1',
      duration_ms: 12,
      is_interrupt: false,
      cwd: '<string:28>',
    });
  });

  test('booleans survive at depth: isError is what the adapter needs', () => {
    expect(
      redact({ tool_response: { isError: true, content: [{ type: 'text', text: 'x' }] } }),
    ).toEqual({
      tool_response: { isError: true, content: [{ type: '<string:4>', text: '<string:1>' }] },
    });
  });
});
