import {useMutation} from "@tanstack/react-query";

import {listTool, type ListToolResult} from "../services/list-tool";
import {SPONSOR_URL} from "../services/sponsor-url";

/**
 * Ask the sponsor to list a URL, and hold the answer (task 53c). The service is pure; this owns
 * the request's lifecycle and the IO it is given.
 */
export function useListTool(): {
    /** `false` when no sponsor is configured: the page offers the wallet path instead. */
    available: boolean;
    submit: (url: string) => void;
    pending: boolean;
    result: ListToolResult | null;
} {
    const mutation = useMutation({
        mutationFn: (url: string) =>
            listTool(url, {endpoint: SPONSOR_URL, fetch: globalThis.fetch.bind(globalThis)}),
    });
    return {
        available: SPONSOR_URL !== undefined,
        submit: (url) => {
            // A new submit clears the last answer, so a repeated outcome is announced again.
            mutation.reset();
            mutation.mutate(url);
        },
        pending: mutation.isPending,
        result: mutation.data ?? null,
    };
}
