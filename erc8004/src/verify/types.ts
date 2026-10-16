/**
 * Types for the external verifier.
 *
 * The verifier reads what an ERC-8004 agent published about itself and checks whether it holds up.
 * It needs no cooperation from the agent: a registration file is a document the agent chose to
 * publish at an address it chose to publish it at, and fetching it is a request anyone may make.
 *
 * Every union here is discriminated by `status`, and every failure carries a `code` rather than only
 * a sentence. That is deliberate: `SignatureVerdict` pairs a `status` with a free-form `reason`, and
 * on 2026-10-16 a consumer suppressed all nine of its reasons on the strength of one of them being
 * redundant. A `code` is branchable without matching prose. See ADR 0030 and `rules/claims.md`.
 */

/** Which key a registration document declared an endpoint under. */
export type DeclarationSpelling = "endpoints" | "services" | "registrations[].endpoints";

/** A protocol with a handshake a prober can actually perform. */
export type KnownProtocol = "mcp" | "a2a";

/** Why a declared endpoint cannot be probed. Named so the probe outcome can reuse it exactly. */
export type NotCheckableCode = "templated" | "non-http-identifier" | "unparseable-url" | "empty";

/**
 * Whether a declared endpoint value is something a prober can reach.
 *
 * **`not-checkable` is not a failure.** It is the verifier declining to judge, and 82% of declared
 * endpoints in the cohort land here. Rendering it in the same register as a confirmed defect would
 * mass-slander the cohort on the first run, which is this task's version of the connector's false
 * `mismatch`.
 */
export type EndpointClassification =
    | {
          status: "probeable";
          /** Normalised through `new URL()`, so a prober does not re-parse. */
          url: string;
          /** Exactly as the document wrote it. */
          declared: string;
      }
    | {
          status: "not-checkable";
          /**
           * - `templated` — an unsubstituted `{placeholder}`. The commonest case by far, 76% of
           *   declared endpoints. The document does not say what to substitute.
           * - `non-http-identifier` — a CAIP address, an ENS name, an email. A legitimate use of
           *   the field for something that is not a URL.
           * - `unparseable-url` — claims an `http(s)` scheme but `new URL()` rejects it. Unlike the
           *   two above, this *is* a fact about the document rather than a limit of ours.
           * - `empty` — absent, blank, or not a string.
           */
          code: NotCheckableCode;
          declared: string;
          /** Present for `templated`: the first placeholder found, e.g. `{agentId}`. */
          placeholder?: string;
      };

/** One endpoint as the document declares it, with its class. No network has been touched. */
export type DeclaredEndpoint = {
    declaredUnder: DeclarationSpelling;
    /** The `name` field, trimmed. `null` when absent or blank — common, and not a defect. */
    name: string | null;
    /** Set only when `name` maps to a protocol with a real handshake. */
    protocol: KnownProtocol | null;
    version: string | null;
    /**
     * Tool names the endpoint claims to serve. Almost always empty — 0 of 112 parsed documents in
     * the 2026-10-16 sample declared any, and only the `endpoints`-spelling documents carry them.
     * When non-empty it is the sharpest check available: declared names against served names.
     */
    capabilities: string[];
    classification: EndpointClassification;
};

/**
 * What a probe established, if anything.
 *
 * The three statuses are the task's three groups, and keeping them apart is the whole job:
 *
 * - `confirmed` — a fact. The endpoint answered, or it did not, and we know which.
 * - `not-checkable` — carried through from the classification. Never probed, nothing claimed.
 * - `inconclusive` — it answered something we did not understand, and **our** handshake may be the
 *   thing at fault. Reported with what we sent so a reader can judge for themselves.
 */
export type ProbeOutcome =
    | {
          status: "confirmed";
          /** `live` and `dead` are both facts; `serves-declared-protocol` is the strongest. */
          code: "live" | "dead" | "serves-declared-protocol" | "declared-protocol-not-served";
          httpStatus: number | null;
          /** What we sent, so any confirmed row can be reproduced with one `curl`. */
          request: ProbeRequest;
          detail: string;
      }
    | {
          status: "not-checkable";
          code: NotCheckableCode;
          detail: string;
      }
    | {
          status: "inconclusive";
          code: "unrecognised-response" | "transport-error" | "rate-limited";
          httpStatus: number | null;
          request: ProbeRequest;
          /** Truncated response body, so a reader can see what confused us. */
          observed: string;
          detail: string;
      };

/** Exactly what the prober sent. Present on every outcome that touched the network. */
export type ProbeRequest = {
    method: "GET" | "POST";
    url: string;
    /** The JSON-RPC method for a protocol handshake, e.g. `initialize`. */
    rpcMethod?: string;
};

/** One endpoint, declared and then probed. */
export type ProbedEndpoint = DeclaredEndpoint & {outcome: ProbeOutcome};

/**
 * Whether the agent's own published identity is reachable — the cheapest and most abundant fact
 * available.
 *
 * Measured 2026-10-16: 23% of random Base token ids have no `tokenURI` at all, and of those that do,
 * 37% publish a registration file that does not resolve. One GET establishes it.
 */
export type DocumentOutcome =
    | {status: "read"; url: string; httpStatus: number}
    | {status: "no-token-uri"}
    | {
          status: "unreachable";
          code: "http-error" | "transport-error" | "not-json" | "unresolvable-scheme";
          url: string | null;
          httpStatus: number | null;
          detail: string;
      };
