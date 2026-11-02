import {describe, expect, it} from "vitest";

import {
    START_PATHS,
    isStartProfile,
    recallProfile,
    rememberProfile,
    startPathTo,
} from "../start-paths";

function memoryStorage(): Storage {
    const store = new Map<string, string>();
    return {
        get length() {
            return store.size;
        },
        clear: () => store.clear(),
        getItem: (key) => store.get(key) ?? null,
        key: (index) => [...store.keys()].at(index) ?? null,
        removeItem: (key) => void store.delete(key),
        setItem: (key, value) => void store.set(key, value),
    };
}

function refusingStorage(): Storage {
    const storage = memoryStorage();
    storage.getItem = () => {
        throw new Error("blocked");
    };
    storage.setItem = () => {
        throw new Error("blocked");
    };
    return storage;
}

describe("start paths", () => {
    it("offers three profiles at launch, the Claude user first and primary", () => {
        expect(START_PATHS.map((path) => path.profile)).toEqual(["claude", "agent", "tool"]);
        expect(START_PATHS.filter((path) => path.primary).map((path) => path.profile)).toEqual([
            "claude",
        ]);
        expect(startPathTo("tool")).toBe("/start/tool");
    });

    it("remembers a choice and gives it back", () => {
        const storage = memoryStorage();
        expect(rememberProfile("agent", storage)).toBe(true);
        expect(recallProfile(storage)).toBe("agent");
    });

    it("ignores a stored value that is not a profile", () => {
        const storage = memoryStorage();
        storage.setItem("arp.start-profile", "operator");
        expect(recallProfile(storage)).toBeNull();
        expect(isStartProfile("operator")).toBe(false);
    });

    it("works without storage: a refusal is reported, never thrown", () => {
        const storage = refusingStorage();
        expect(rememberProfile("claude", storage)).toBe(false);
        expect(recallProfile(storage)).toBeNull();
    });
});
