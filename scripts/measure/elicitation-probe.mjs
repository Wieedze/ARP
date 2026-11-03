/** A stub MCP server that asks the client one MCP elicitation and logs everything (task 61).
 *
 *  Register it in a project's .mcp.json, then ask the agent to "call the probe tool":
 *
 *      {"mcpServers":{"probe":{"command":"node","args":["<repo>/scripts/measure/elicitation-probe.mjs"],
 *        "env":{"PROBE_LOG":"<dir>/log.txt"}}}}
 *
 *  It logs every line both ways, and on `initialize` one line `CLIENT <clientInfo> CAPS
 *  <capabilities>`: what the client says it can do. On `tools/call` it sends `elicitation/create`
 *  and returns the client's answer as the tool result. `PROBE_PARAMS` names a JSON file holding the
 *  elicitation's params; without it a one-line question is sent.
 *
 *  The log cannot tell who answered — a person or the client on its own. Whether a dialog was shown
 *  is what the person running the probe reports; ADR `0127` says which rows rest on that.
 */
import { appendFileSync, readFileSync } from 'node:fs';
import { createInterface } from 'node:readline';

const LOG = process.env.PROBE_LOG;
const log = (line) => appendFileSync(LOG, `${line}\n`);
const send = (message) => {
  const line = JSON.stringify(message);
  log(`> ${line}`);
  process.stdout.write(`${line}\n`);
};
const QUESTION = process.env.PROBE_PARAMS
  ? JSON.parse(readFileSync(process.env.PROBE_PARAMS, 'utf8'))
  : {
      message: 'Install skill X? (probe)',
      requestedSchema: { type: 'object', properties: { accept: { type: 'boolean', title: 'Install' } }, required: ['accept'] },
    };

let open = null;
createInterface({ input: process.stdin }).on('line', (line) => {
  log(`< ${line}`);
  const m = JSON.parse(line);
  if (m.method === 'initialize') {
    log(`CLIENT ${JSON.stringify(m.params.clientInfo)} CAPS ${JSON.stringify(m.params.capabilities)}`);
    send({ jsonrpc: '2.0', id: m.id, result: { protocolVersion: m.params.protocolVersion, capabilities: { tools: {} }, serverInfo: { name: 'probe', version: '0' } } });
  } else if (m.method === 'tools/list') {
    send({ jsonrpc: '2.0', id: m.id, result: { tools: [{ name: 'probe', description: 'Call this once when asked.', inputSchema: { type: 'object', properties: {} } }] } });
  } else if (m.method === 'tools/call') {
    open = m.id;
    send({ jsonrpc: '2.0', id: 'e1', method: 'elicitation/create', params: QUESTION });
  } else if (m.id === 'e1') {
    send({ jsonrpc: '2.0', id: open, result: { content: [{ type: 'text', text: `elicitation answered: ${JSON.stringify(m.result ?? m.error)}` }] } });
  } else if (m.id !== undefined && m.method) {
    send({ jsonrpc: '2.0', id: m.id, result: {} });
  }
});
