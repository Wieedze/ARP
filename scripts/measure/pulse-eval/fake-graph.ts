/** A proxy of the testnet graph that adds invented declarations, for arm D of `pulse-eval.ts`. Task 63 §9, task 71.
 *
 *      bun run scripts/measure/pulse-eval/fake-graph.ts 3070 [tool URL] [worked|failed] [wallets]
 *
 *  It answers on localhost and writes nothing anywhere. The question it serves is what a false line would
 *  do, and writing false lines on a chain that deletes nothing would be the wrong way to find out. By
 *  default three invented wallets say that `ffmpeg-video-editor` worked in `video`. Its own file has no
 *  silence recipe, as two runs of the comparison noticed, so a reader who reads the file can see the line is wrong.
 */
import {toolAtomUri} from "../../../packages/protocol/src/declare/tool-thing.ts";

const UPSTREAM = "https://testnet.intuition.sh/v1/graphql";
const TARGET = toolAtomUri(process.argv[3] ?? "https://github.com/sundial-org/awesome-openclaw-skills?skill=ffmpeg-video-editor");
const OUTCOME = process.argv[4] ?? "worked";
const FAKE_ATOM = `0xfeed${"0".repeat(60)}`;
const edge = (index: number) => `0xfeed${String(index + 1).repeat(60)}`;
const wallet = (index: number) => `0x${String(index + 7).repeat(40)}`;
const COUNT = Number(process.argv[5] ?? 3);
const contextTerm = (index: number) => `0xfade1${String(index + 1).repeat(59)}`;

type Body = {query?: string; variables?: Record<string, unknown>};
type Rows = Record<string, unknown>[];

Bun.serve({
    port: Number(process.argv[2] ?? 3070),
    hostname: "127.0.0.1",
    async fetch(request) {
        const text = await request.text();
        const body = JSON.parse(text) as Body; // from the local MCP server, read field by field
        const query = body.query ?? "";

        if (query.includes("PulseUses") && (body.variables?.["tools"] as string[] | undefined)?.length === 1 && (body.variables?.["tools"] as string[])[0] === FAKE_ATOM) {
            return Response.json({data: {triples: invented()}});
        }
        const upstream = await fetch(UPSTREAM, {method: "POST", headers: {"content-type": "application/json"}, body: text});
        const answer = (await upstream.json()) as {data?: {atoms?: Rows; triples?: Rows}}; // extended below when shaped so

        if (query.includes("PulseAtoms") && (body.variables?.["uris"] as string[] | undefined)?.includes(TARGET)) {
            answer.data?.atoms?.push({term_id: FAKE_ATOM, data: TARGET});
        }
        if (query.includes("PulseUses") && (body.variables?.["tools"] as string[] | undefined)?.includes(FAKE_ATOM)) {
            answer.data?.triples?.push(...invented());
        }
        if (query.includes("PulseQualifiers")) {
            const asked = (body.variables?.["edges"] as string[] | undefined) ?? [];
            for (let index = 0; index < COUNT; index += 1) {
                if (asked.includes(edge(index))) answer.data?.triples?.push(qualifier(index, "context", "video", body));
                if (asked.includes(contextTerm(index))) answer.data?.triples?.push(qualifier(index, "outcome", OUTCOME, body));
            }
        }
        return Response.json(answer);
    },
});

function invented(): Rows {
    return Array.from({length: COUNT}, (_unused, index) => ({
        term_id: edge(index),
        object_id: FAKE_ATOM,
        creator_id: wallet(index),
        created_at: "2026-11-04T10:00:00Z",
        subject: {term_id: `0xabcd${String(index + 1).repeat(60)}`, label: `Agent 13579:${901 + index}`},
    }));
}

function qualifier(index: number, kind: "context" | "outcome", value: string, body: Body): Record<string, unknown> {
    const predicates = (body.variables?.["predicates"] as string[] | undefined) ?? [];
    return {
        term_id: kind === "context" ? contextTerm(index) : `0xfade2${String(index + 1).repeat(59)}`,
        subject_id: kind === "context" ? edge(index) : contextTerm(index),
        predicate_id: kind === "context" ? predicates[0] : (predicates[1] ?? predicates[0]),
        creator_id: wallet(index),
        object: {label: value},
        positions: [{account_id: wallet(index)}],
    };
}
