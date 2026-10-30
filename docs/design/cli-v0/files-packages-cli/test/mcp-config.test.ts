import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { readMcpServers, sourceOf } from '../src/mcp-config.js';
import { tempDir } from './helpers.js';

describe('readMcpServers', () => {
  it('merges user, local and project scope, later winning', () => {
    const home = tempDir();
    const cwd = join(home, 'proj');
    mkdirSync(cwd);
    writeFileSync(
      join(home, '.claude.json'),
      JSON.stringify({
        mcpServers: {
          github: { url: 'https://api.githubcopilot.com/mcp/' },
          shared: { command: 'npx', args: ['-y', 'old-pkg'] },
        },
        projects: {
          [cwd]: { mcpServers: { local: { command: 'uvx', args: ['mcp-server-time'] } } },
        },
      }),
    );
    writeFileSync(
      join(cwd, '.mcp.json'),
      JSON.stringify({
        mcpServers: { shared: { command: 'npx', args: ['-y', '@scope/new-pkg@2.1.0'] } },
      }),
    );
    const servers = readMcpServers({ cwd, home });
    expect([...servers.keys()].sort()).toEqual(['github', 'local', 'shared']);
    expect(servers.get('shared')).toEqual({
      transport: 'local',
      command: 'npx',
      args: ['-y', '@scope/new-pkg@2.1.0'],
    });
  });

  it('returns nothing when no file exists or one is broken', () => {
    const home = tempDir();
    writeFileSync(join(home, '.claude.json'), '{not json');
    expect(readMcpServers({ cwd: home, home }).size).toBe(0);
  });
});

describe('sourceOf', () => {
  it('resolves a remote server to its URL', () => {
    expect(sourceOf({ transport: 'remote', url: 'https://mcp.example.dev/sse' })).toEqual({
      kind: 'mcp_remote',
      url: 'https://mcp.example.dev/sse',
      host: 'mcp.example.dev',
    });
  });

  it('resolves an npx or uvx server to its package page, without the version', () => {
    expect(
      sourceOf({ transport: 'local', command: 'npx', args: ['-y', '@scope/pkg@1.2.3', '--stdio'] }),
    ).toEqual({
      kind: 'mcp_local',
      url: 'https://www.npmjs.com/package/@scope/pkg',
      host: 'www.npmjs.com',
    });
    expect(
      sourceOf({ transport: 'local', command: '/usr/local/bin/uvx', args: ['mcp-server-fetch'] }),
    ).toEqual({
      kind: 'mcp_local',
      url: 'https://pypi.org/project/mcp-server-fetch',
      host: 'pypi.org',
    });
  });

  it('keeps a script, a local path or localhost private', () => {
    expect(sourceOf({ transport: 'local', command: 'node', args: ['./server.js'] })).toEqual({
      kind: 'private',
    });
    expect(sourceOf({ transport: 'local', command: 'npx', args: ['./local-dir'] })).toEqual({
      kind: 'private',
    });
    expect(sourceOf({ transport: 'remote', url: 'http://localhost:3000/mcp' })).toEqual({
      kind: 'private',
    });
    expect(sourceOf(undefined)).toEqual({ kind: 'private' });
  });
});
