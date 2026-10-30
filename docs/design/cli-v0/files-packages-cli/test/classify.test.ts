import { classifyCall } from '../src/classify.js';

describe('classifyCall', () => {
  it('reads an answer with no error as ok', () => {
    expect(
      classifyCall('PostToolUse', { tool_response: { content: [{ type: 'text', text: 'done' }] } }),
    ).toEqual({ outcome: 'ok', code: null });
    expect(classifyCall('PostToolUse', { tool_response: 'plain text' })).toEqual({
      outcome: 'ok',
      code: null,
    });
    expect(classifyCall('PostToolUse', {})).toEqual({ outcome: 'ok', code: null });
  });

  it('does not read the text of a successful answer, even when it mentions an error', () => {
    // A search result about "401 errors" is a successful call.
    const result = classifyCall('PostToolUse', {
      tool_response: { content: [{ type: 'text', text: 'How to fix 401 Unauthorized' }] },
    });
    expect(result).toEqual({ outcome: 'ok', code: null });
  });

  it('treats the MCP error flag as a tool error', () => {
    expect(
      classifyCall('PostToolUse', {
        tool_response: { isError: true, content: [{ type: 'text', text: 'boom' }] },
      }),
    ).toEqual({ outcome: 'tool_error', code: null });
  });

  it('puts each failure in its category, with at most a status code', () => {
    expect(classifyCall('PostToolUseFailure', { error: 'HTTP 502 Bad Gateway' })).toEqual({
      outcome: 'tool_error',
      code: '502',
    });
    expect(classifyCall('PostToolUseFailure', { error: 'Request failed with status 401' })).toEqual(
      { outcome: 'auth', code: '401' },
    );
    expect(classifyCall('PostToolUseFailure', { error: 'Forbidden' })).toEqual({
      outcome: 'auth',
      code: null,
    });
    expect(
      classifyCall('PostToolUseFailure', { error: 'MCP error -32001: Request timed out' }),
    ).toEqual({ outcome: 'timeout', code: null });
    expect(
      classifyCall('PostToolUseFailure', { error: 'getaddrinfo ENOTFOUND api.example.dev' }),
    ).toEqual({ outcome: 'unreachable', code: null });
    expect(classifyCall('PostToolUseFailure', { error: '402 Payment Required' })).toEqual({
      outcome: 'payment',
      code: '402',
    });
    expect(
      classifyCall('PostToolUseFailure', {
        error: { message: 'connect ECONNREFUSED 127.0.0.1:3000' },
      }),
    ).toEqual({ outcome: 'unreachable', code: null });
    expect(classifyCall('PostToolUseFailure', { error: 'something odd' })).toEqual({
      outcome: 'tool_error',
      code: null,
    });
  });

  it('prefers a numeric status field over the text', () => {
    expect(classifyCall('PostToolUseFailure', { error: { status: 403, message: 'nope' } })).toEqual(
      { outcome: 'auth', code: '403' },
    );
  });

  it('does not count a call the user cancelled or refused', () => {
    expect(classifyCall('PostToolUseFailure', { is_interrupt: true, error: 'x' })).toBeNull();
    expect(
      classifyCall('PostToolUseFailure', { error: 'The user rejected this tool call' }),
    ).toBeNull();
    expect(classifyCall('PostToolUseFailure', { error: 'Interrupted by user' })).toBeNull();
  });

  it('never throws on a shape it has not seen', () => {
    for (const odd of [
      { error: 42 },
      { error: null },
      { tool_response: [1, 2] },
      { tool_response: { content: 'x' } },
    ]) {
      expect(() => classifyCall('PostToolUseFailure', odd)).not.toThrow();
    }
  });
});
