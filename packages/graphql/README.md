# @arp-protocol/graphql

The read layer under `@arp-protocol/core`: an HTTP transport with a deadline, a GraphQL client over
it, and every query document the protocol sends to an Intuition indexer.

It knows the Intuition schema and nothing about ARP. No term id, no predicate, no chain: every id a
query filters on arrives as a variable, so one document runs against whichever indexer the
transport points at.

```ts
import {createGraphqlTransport, defaultFetch, TOOL_USAGE_QUERY} from "@arp-protocol/graphql";

const transport = createGraphqlTransport({url, fetch: defaultFetch()});
const data = await transport.request(TOOL_USAGE_QUERY, {toolId, uses, curveId: "1"});
```

The documents are kept apart from the code that maps their answers, which lives in
`@arp-protocol/core`. A field added here is read there; change both in one commit.

Why this is its own package: ADR `0082`.
