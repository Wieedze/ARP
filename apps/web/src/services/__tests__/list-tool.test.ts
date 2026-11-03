import {describe, expect, it, vi} from "vitest";

import {listTool, listToolMessage} from "../list-tool";

const URL_ = "https://github.com/Wieedze/ARP?skill=arp";

function answering(status: number, body: unknown): typeof fetch {
    return vi.fn(async () => new Response(JSON.stringify(body), {status}));
}

describe("listing a tool through the sponsor", () => {
    it("posts the URL as JSON and reads a fresh listing", async () => {
        const fetch = answering(200, {atomId: "0xabc", created: true, transactions: ["0x1"]});
        const result = await listTool(URL_, {endpoint: "http://127.0.0.1:3200", fetch});

        expect(fetch).toHaveBeenCalledWith("http://127.0.0.1:3200/list-tool", {
            method: "POST",
            headers: {"content-type": "application/json"},
            body: JSON.stringify({url: URL_}),
        });
        expect(result).toEqual({
            status: "listed",
            atomId: "0xabc",
            created: true,
            transactions: ["0x1"],
        });
        expect(listToolMessage(result)).toBe("Listed.");
    });

    it("says already listed when nothing was spent", async () => {
        const result = await listTool(URL_, {
            endpoint: "http://sponsor",
            fetch: answering(200, {atomId: "0xabc", created: false, transactions: []}),
        });
        expect(listToolMessage(result)).toBe("Already listed.");
    });

    it("names the rule that refused it", async () => {
        const cases = [
            [400, {error: "e", rule: "url"}, "That is not a tool or skill URL."],
            [422, {error: "e", rule: "resolves"}, "Nothing found at that URL on GitHub."],
            [429, {error: "e", rule: "limit"}, "Today's limit is reached. Try again tomorrow."],
            [
                503,
                {error: "e", rule: "resolves", retry: true},
                "Not answered right now. Try again.",
            ],
            [502, {error: "e", rule: "pin"}, "The sponsor could not list it."],
        ] as const;
        for (const [status, body, message] of cases) {
            const result = await listTool(URL_, {
                endpoint: "http://sponsor",
                fetch: answering(status, body),
            });
            expect(result.status).toBe("refused");
            expect(listToolMessage(result)).toBe(message);
        }
    });

    it("sends nothing without a sponsor, and says so when it does not answer", async () => {
        const fetch = vi.fn();
        expect(await listTool(URL_, {endpoint: undefined, fetch})).toEqual({status: "unavailable"});
        expect(fetch).not.toHaveBeenCalled();

        const down = vi.fn(async () => {
            throw new TypeError("Failed to fetch");
        });
        const result = await listTool(URL_, {endpoint: "http://sponsor", fetch: down});
        expect(listToolMessage(result)).toBe("The sponsor is not running.");
    });
});
