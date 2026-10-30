/**
 * Split Claude Code's name for an MCP tool call into its server and its function.
 *
 * Claude Code names them `mcp__<server>__<function>`, and a plugin's server
 * `mcp__plugin_<plugin>_<server>__<function>`. The server segment is kept whole: it is the key the
 * user's MCP configuration uses, and the hook only needs to find it there.
 *
 * Anything else (`Bash`, `Edit`) is not an MCP tool and returns `null`: the hook is registered on
 * `mcp__.*`, but a matcher is a regex and a wrong match must not become a tool.
 */
export type McpToolName = { server: string; fn: string };

export function parseMcpToolName(toolName: string): McpToolName | null {
  if (!toolName.startsWith('mcp__')) return null;
  const rest = toolName.slice('mcp__'.length);
  const split = rest.indexOf('__');
  if (split <= 0) return null;
  const server = rest.slice(0, split);
  const fn = rest.slice(split + 2);
  if (fn.length === 0) return null;
  return { server, fn };
}
