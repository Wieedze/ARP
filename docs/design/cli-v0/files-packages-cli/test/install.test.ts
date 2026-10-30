import { withArpHooks, withoutArpHooks } from '../src/install.js';

const marker = '/home/u/.arp/cli';
const command = `"/usr/bin/node" "${marker}/cli.js" hook`;
const theirs = { type: 'command', command: '/opt/lint.sh' };

describe('installing the hooks', () => {
  it("adds one hook per event, keeping the user's own", () => {
    const before = {
      model: 'opus',
      hooks: { PostToolUse: [{ matcher: 'Edit', hooks: [theirs] }] },
    };
    const after = withArpHooks(before, command, marker);
    expect(after.model).toBe('opus');
    const hooks = after.hooks as Record<
      string,
      { matcher?: string; hooks: { command: string; async?: boolean }[] }[]
    >; // shape built by withArpHooks
    expect(hooks.PostToolUse).toHaveLength(2);
    expect(hooks.PostToolUse![0]!.hooks[0]!.command).toBe('/opt/lint.sh');
    expect(hooks.PostToolUse![1]).toEqual({
      matcher: 'mcp__.*',
      hooks: [{ type: 'command', command, timeout: 10, async: true }],
    });
    expect(hooks.PreToolUse).toHaveLength(1);
    expect(hooks.PostToolUseFailure).toHaveLength(1);
    expect(hooks.SessionStart).toEqual([{ hooks: [{ type: 'command', command, timeout: 5 }] }]);
  });

  it('is idempotent', () => {
    const once = withArpHooks({}, command, marker);
    expect(withArpHooks(once, command, marker)).toEqual(once);
  });

  it('leaves no empty hooks object behind', () => {
    expect(withoutArpHooks(withArpHooks({ model: 'opus' }, command, marker), marker)).toEqual({
      model: 'opus',
    });
  });

  it('removes only its own hooks', () => {
    const installed = withArpHooks(
      { hooks: { PostToolUse: [{ matcher: 'Edit', hooks: [theirs] }] } },
      command,
      marker,
    );
    expect(withoutArpHooks(installed, marker)).toEqual({
      hooks: { PostToolUse: [{ matcher: 'Edit', hooks: [theirs] }] },
    });
  });
});
