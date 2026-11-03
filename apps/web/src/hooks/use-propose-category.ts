import {useMutation} from "@tanstack/react-query";

import {
    proposeCategory,
    type CategoryRequest,
    type ProposeCategoryResult,
} from "../services/propose-category";
import {SPONSOR_URL} from "../services/sponsor-url";

/** Tag a tool with a category, or file a new one, and hold the answer (task 59). */
export function useProposeCategory(): {
    available: boolean;
    submit: (request: CategoryRequest) => void;
    pending: boolean;
    result: ProposeCategoryResult | null;
} {
    const mutation = useMutation({
        mutationFn: (request: CategoryRequest) =>
            proposeCategory(request, {
                endpoint: SPONSOR_URL,
                fetch: globalThis.fetch.bind(globalThis),
            }),
    });
    return {
        available: SPONSOR_URL !== undefined,
        submit: (request) => {
            // A new submit clears the last answer, so a repeated outcome is announced again.
            mutation.reset();
            mutation.mutate(request);
        },
        pending: mutation.isPending,
        result: mutation.data ?? null,
    };
}
