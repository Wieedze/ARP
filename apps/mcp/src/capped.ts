/** The body as text, refused past `cap` bytes without reading the rest. */
export async function cappedText(response: Response, cap: number): Promise<string> {
  const declared = Number(response.headers.get('content-length') ?? '0');
  if (declared > cap) throw new Error(`the document is over ${cap} bytes`);
  const reader = response.body?.getReader();
  if (reader === undefined) return '';
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > cap) {
      await reader.cancel();
      throw new Error(`the document is over ${cap} bytes`);
    }
    chunks.push(value);
  }
  return new TextDecoder().decode(Buffer.concat(chunks));
}
