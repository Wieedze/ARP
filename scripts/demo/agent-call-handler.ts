/** The job in `agent-call-test.sh`: data this node alone holds. The notes are invented for the test. */
const NOTES: Record<string, string> = {
  'orchard-17': 'The Orchard review moved to 14 March. Budget approved: 41,300. Owner: the Lisbon office.',
  'harbor-04': 'Harbor is paused until the second audit. Open issues: 9.',
};

export const offer = {
  description: 'Answers from a private collection of internal project notes that are published nowhere else.',
  input: '{"note": "<the note id, such as orchard-17>"}',
  output: '{"note": "<id>", "text": "<the note>"}',
};

export async function handle(payload: unknown): Promise<{ note: string; text: string | null }> {
  const note = (payload as { note?: unknown } | null)?.note; // narrowed on the next line
  if (typeof note !== 'string') throw new Error('payload.note must be a string');
  return { note, text: NOTES[note] ?? null };
}
