export type JsonRpcId = string | number | null;
export type Rpc = {
  jsonrpc?: string;
  id?: JsonRpcId;
  method?: string;
  params?: Record<string, unknown>;
};

export function result(id: JsonRpcId, value: unknown) {
  return Response.json({ jsonrpc: '2.0', id, result: value });
}

/** JSON-RPC error codes. -32602 is invalid params, -32601 method not found, -32603 internal. */
export function fail(id: JsonRpcId, code: number, message: string) {
  return Response.json({ jsonrpc: '2.0', id, error: { code, message } });
}

export function text(id: JsonRpcId, value: unknown) {
  return result(id, { content: [{ type: 'text', text: JSON.stringify(value, null, 2) }] });
}

export const isTermId = (value: unknown): value is `0x${string}` =>
  typeof value === 'string' && /^0x[0-9a-fA-F]{64}$/.test(value);
export const isAddress = (value: unknown): value is `0x${string}` =>
  typeof value === 'string' && /^0x[0-9a-fA-F]{40}$/.test(value);
