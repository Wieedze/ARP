import { parseMcpToolName } from '../src/tool-name.js';
import { toolIdOf } from '../src/tool-id.js';

describe('parseMcpToolName', () => {
  it('splits server and function', () => {
    expect(parseMcpToolName('mcp__github__create_issue')).toEqual({
      server: 'github',
      fn: 'create_issue',
    });
    expect(parseMcpToolName('mcp__plugin_acme_search__query')).toEqual({
      server: 'plugin_acme_search',
      fn: 'query',
    });
    expect(parseMcpToolName('mcp__a__b__c')).toEqual({ server: 'a', fn: 'b__c' });
  });

  it('refuses what is not an MCP tool', () => {
    for (const name of ['Bash', 'mcp__', 'mcp__github', 'mcp____x', 'mcp__github__'])
      expect(parseMcpToolName(name)).toBeNull();
  });

  it('gives one server one stable id', () => {
    expect(toolIdOf('github')).toBe(toolIdOf('github'));
    expect(toolIdOf('github')).not.toBe(toolIdOf('gitlab'));
    expect(toolIdOf('github')).toMatch(/^[0-9a-f]{16}$/);
  });
});
