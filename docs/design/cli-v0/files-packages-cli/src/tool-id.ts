import { createHash } from 'node:crypto';

/**
 * The local id of a tool: a fingerprint of the **server name** the user configured.
 *
 * The spec suggested a fingerprint of the normalised URL. Keyed by URL, a server that moves to
 * another host would become a second tool and the "host changed" alert, which compares the URL a
 * name pointed at before and after, could never fire. The name is what the user and the agent call
 * the tool; the URL is a property of it that can change, and the `tools` row records it.
 */
export function toolIdOf(server: string): string {
  return createHash('sha256').update(`mcp-server:${server}`).digest('hex').slice(0, 16);
}
