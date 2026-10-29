import {keccak256, stringToBytes, type Hex} from "viem";
import {privateKeyToAccount} from "viem/accounts";
import {describe, expect, it} from "vitest";

import {
    contentDigest,
    contentRequestTypedData,
    corroborationOf,
    contentReceiptTypedData,
    receiptMatchesContent,
    recoverContentRequester,
    signContentReceipt,
    UNAUTHENTICATED,
    verifyContentReceipt,
    type ContentReceipt,
    type SignedContentReceipt,
} from "../src/receipt.js";

const NODE = privateKeyToAccount(`0x${"11".repeat(32)}`);
const OTHER = privateKeyToAccount(`0x${"22".repeat(32)}`);
const CALLER = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8" as const;
const TESTNET = 13579;
const MAINNET = 1155;

const BYTES = stringToBytes("# Product photography\n\nPut the bottle on the left.\n");

const receipt = (over: Partial<ContentReceipt> = {}): ContentReceipt => ({
    atom: `0x${"ab".repeat(32)}`,
    url: "https://github.com/magentosh/superpowers?skill=product-photography",
    path: "skills/product-photography/SKILL.md",
    digest: contentDigest(BYTES),
    to: CALLER,
    servedAt: 1793462400,
    nonce: keccak256(stringToBytes("one")),
    ...over,
});

/** Signs with whichever account is named, and declares whichever account is named second. */
async function sign(
    body: ContentReceipt,
    chainId = TESTNET,
    signWith = NODE,
    declare_ = signWith,
): Promise<SignedContentReceipt> {
    const signed = await signContentReceipt(body, chainId, {
        address: signWith.address,
        signTypedData: (data) => signWith.signTypedData(data),
    });
    return {...signed, node: declare_.address};
}

describe("contentDigest", () => {
    it("is sha256, which is what a stranger's own sha256sum prints", () => {
        // The published vector for the empty input. It is here so the choice of hash is pinned by
        // a test rather than by a comment: a third party checking a receipt runs `sha256sum`, and
        // if this were keccak256 they would have to trust a library of ours instead.
        expect(contentDigest(new Uint8Array())).toBe(
            "0xe3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
        );
    });
});

describe("signContentReceipt", () => {
    it("never holds a key — it calls the signer it was handed", async () => {
        // ADR `0038`'s line, kept at the type level: the only way to sign is to pass something
        // that can. A module that could construct an account could sign without being asked to.
        let asked = 0;
        const signed = await signContentReceipt(receipt(), TESTNET, {
            address: NODE.address,
            signTypedData: (data) => {
                asked += 1;
                return NODE.signTypedData(data);
            },
        });
        expect(asked).toBe(1);
        expect(signed.node).toBe(NODE.address);
        expect(signed.chainId).toBe(TESTNET);
    });
});

describe("verifyContentReceipt", () => {
    it("recovers the signer on an untouched receipt", async () => {
        const verdict = await verifyContentReceipt(await sign(receipt()));
        expect(verdict).toEqual({status: "valid", signer: NODE.address, namesNobody: false});
    });

    it("refuses a receipt replayed onto the other chain", async () => {
        // The failure that justifies EIP-712 here. An atom id is a pure function of its URL
        // (ADR `0054`), so the SAME tool has the SAME atom id on 13579 and on 1155. Without the
        // chain inside the signed domain, a testnet receipt would verify as a mainnet one — and a
        // mainnet receipt is the one that implies real value moved.
        const signed = await sign(receipt(), TESTNET);
        const replayed: SignedContentReceipt = {...signed, chainId: MAINNET};
        const verdict = await verifyContentReceipt(replayed);
        expect(verdict.status).toBe("mismatch");
    });

    it("catches a signer that signed nothing it declares", async () => {
        const verdict = await verifyContentReceipt(await sign(receipt(), TESTNET, OTHER, NODE));
        expect(verdict).toEqual({
            status: "mismatch",
            declared: NODE.address,
            recovered: OTHER.address,
        });
    });

    it.each([
        ["url", {url: "https://github.com/101-skills/superpowers?skill=product-photography"}],
        ["path", {path: ".claude/skills/product-photography/SKILL.md"}],
        ["atom", {atom: `0x${"cd".repeat(32)}` as Hex}],
        ["digest", {digest: contentDigest(stringToBytes("something else"))}],
        ["to", {to: NODE.address}],
        ["servedAt", {servedAt: 1793462401}],
        ["nonce", {nonce: keccak256(stringToBytes("two"))}],
    ])("catches a changed %s", async (_field, over) => {
        const signed = await sign(receipt());
        const tampered: SignedContentReceipt = {...signed, receipt: {...signed.receipt, ...over}};
        expect((await verifyContentReceipt(tampered)).status).toBe("mismatch");
    });

    it("says a receipt serving an unauthenticated caller names nobody", async () => {
        // `tasks/31` §5.3: the index stays open and the receipt is what has a price. A caller that
        // proved no address gets bytes and a receipt that corroborates nothing — reported, because
        // a reader must be able to tell that case from a receipt naming an agent.
        const verdict = await verifyContentReceipt(await sign(receipt({to: null})));
        expect(verdict).toEqual({status: "valid", signer: NODE.address, namesNobody: true});
    });

    it("treats the zero address the same as no address", async () => {
        const verdict = await verifyContentReceipt(await sign(receipt({to: UNAUTHENTICATED})));
        expect(verdict.status === "valid" && verdict.namesNobody).toBe(true);
    });

    it.each([
        ["atom is not bytes32", {atom: "0xab" as Hex}],
        ["digest is not bytes32", {digest: "0x" as Hex}],
        ["nonce is not bytes32", {nonce: "0xdeadbeef" as Hex}],
        ["servedAt is not a unix timestamp", {servedAt: -1}],
    ])("reports %s rather than guessing", async (reason, over) => {
        const signed = await sign(receipt());
        const broken: SignedContentReceipt = {...signed, receipt: {...signed.receipt, ...over}};
        expect(await verifyContentReceipt(broken)).toEqual({status: "malformed", reason});
    });

    it("reports a chain id that is not one", async () => {
        const signed = await sign(receipt());
        expect(await verifyContentReceipt({...signed, chainId: 0})).toEqual({
            status: "malformed",
            reason: "chainId is not a chain id",
        });
    });

    it("reports a signature that is not hex", async () => {
        const signed = await sign(receipt());
        expect(await verifyContentReceipt({...signed, signature: "nope" as Hex})).toEqual({
            status: "malformed",
            reason: "signature is not hex",
        });
    });
});

describe("recoverContentRequester", () => {
    const ATOM = `0x${"ab".repeat(32)}` as const;
    const NONCE = keccak256(stringToBytes("caller-nonce"));

    const ask = (account: typeof NODE, chainId = TESTNET) =>
        account.signTypedData(contentRequestTypedData(ATOM, NONCE, chainId));

    it("recovers the caller who asked", async () => {
        const signature = await ask(OTHER);
        expect(await recoverContentRequester(ATOM, NONCE, TESTNET, signature)).toBe(OTHER.address);
    });

    it("does not recover the caller on the other chain", async () => {
        const signature = await ask(OTHER, TESTNET);
        const elsewhere = await recoverContentRequester(ATOM, NONCE, MAINNET, signature);
        expect(elsewhere).not.toBe(OTHER.address);
    });

    it("recovers nobody for a different atom or a different nonce", async () => {
        const signature = await ask(OTHER);
        const otherAtom = await recoverContentRequester(
            `0x${"cd".repeat(32)}`,
            NONCE,
            TESTNET,
            signature,
        );
        expect(otherAtom).not.toBe(OTHER.address);
        const otherNonce = await recoverContentRequester(
            ATOM,
            keccak256(stringToBytes("else")),
            TESTNET,
            signature,
        );
        expect(otherNonce).not.toBe(OTHER.address);
    });

    it("returns null rather than throwing on a request that identifies nobody", async () => {
        // An unauthenticated fetch is a SERVED state, not an error: the bytes go out and the
        // receipt corroborates nobody. `tasks/31` §5.3.
        expect(await recoverContentRequester(ATOM, NONCE, TESTNET, "0x")).toBeNull();
        expect(await recoverContentRequester(ATOM, NONCE, TESTNET, "not hex" as Hex)).toBeNull();
        expect(
            await recoverContentRequester(ATOM, NONCE, TESTNET, `0x${"00".repeat(65)}`),
        ).toBeNull();
    });

    it("makes a replayed request produce the same receipt, not a second one", async () => {
        // The reason the CALLER supplies the nonce. Signing the same request twice yields the same
        // `to` and the same nonce, so the node's receipt is byte-identical and a reader counting
        // receipts counts one. A stolen signature buys a copy of a receipt that already exists.
        const signature = await ask(OTHER);
        const first = await recoverContentRequester(ATOM, NONCE, TESTNET, signature);
        const second = await recoverContentRequester(ATOM, NONCE, TESTNET, signature);
        expect(first).toBe(second);

        const one = await sign(receipt({to: first, nonce: NONCE}));
        const two = await sign(receipt({to: second, nonce: NONCE}));
        expect(one.signature).toBe(two.signature);
    });
});

describe("corroborationOf", () => {
    const AGENT = CALLER;

    it("is a two-party fact when the signer is not the declarer", async () => {
        const verdict = await verifyContentReceipt(await sign(receipt()));
        expect(
            verdict.status === "valid" && corroborationOf(receipt(), verdict.signer, AGENT),
        ).toEqual({status: "second-party", signer: NODE.address});
    });

    it("says self-signed when one hand holds both keys", () => {
        // ADR `0080`: the node an operator installs holds its own key, so this is the normal case
        // for a local node and it is REPORTED rather than refused. A forged one costs the agent the
        // price of the claim and earns a reputation on a tool it never used.
        const body = receipt({to: NODE.address});
        expect(corroborationOf(body, NODE.address, NODE.address)).toEqual({
            status: "self-signed",
            signer: NODE.address,
        });
    });

    it("says so when the receipt is about a different caller", () => {
        // A real receipt, correctly signed, for somebody else's fetch. Letting it corroborate this
        // declaration would be the easiest forgery in the system: present a stranger's receipt.
        expect(corroborationOf(receipt({to: OTHER.address}), NODE.address, AGENT)).toEqual({
            status: "other-caller",
            servedTo: OTHER.address,
        });
    });

    it("corroborates nobody on an unauthenticated fetch", () => {
        expect(corroborationOf(receipt({to: null}), NODE.address, AGENT)).toEqual({
            status: "names-nobody",
        });
        expect(corroborationOf(receipt({to: UNAUTHENTICATED}), NODE.address, AGENT)).toEqual({
            status: "names-nobody",
        });
    });

    it("compares addresses by checksum, not by spelling", () => {
        // Two spellings of one address are one address. A string comparison here would report a
        // second party where there is one hand, which is the wrong direction to be wrong in.
        const lower = CALLER.toLowerCase() as typeof CALLER;
        expect(corroborationOf(receipt({to: lower}), lower, CALLER).status).toBe("self-signed");
    });
});

describe("receiptMatchesContent", () => {
    it("accepts the bytes the digest is over", () => {
        expect(receiptMatchesContent(receipt(), BYTES)).toBe(true);
    });

    it("refuses one changed byte", () => {
        const changed = stringToBytes("# Product photography\n\nPut the bottle on the right.\n");
        expect(receiptMatchesContent(receipt(), changed)).toBe(false);
    });

    it("needs no signature, which is the point", () => {
        // This half of the verification is what a stranger runs: fetch `url`'s repository at
        // `path`, hash it, compare. No key of ours, no library of ours, nothing to ask us for.
        expect(
            receiptMatchesContent(receipt({to: null, nonce: `0x${"00".repeat(32)}`}), BYTES),
        ).toBe(true);
    });
});

describe("contentReceiptTypedData", () => {
    it("carries the chain in the domain and no verifying contract", () => {
        // No contract checks this signature. Naming one would imply an on-chain check that does
        // not exist — the same deliberate absence as `agent-import.ts`'s import consent.
        const data = contentReceiptTypedData(receipt(), TESTNET);
        expect(data.domain).toEqual({name: "ARP Content Receipt", version: "1", chainId: TESTNET});
        expect("verifyingContract" in data.domain).toBe(false);
    });

    it("sends the path as the path, so a verifier can find the file", () => {
        // 46 of 662 catalogued skills exist at several byte-identical paths in one repository, and
        // 2 more at paths that differ (`scripts/measure/skill-layouts.ts`, 2026-10-29). An atom
        // names a repository and a skill; only this field names the file.
        const data = contentReceiptTypedData(receipt(), TESTNET);
        expect(data.message.path).toBe("skills/product-photography/SKILL.md");
    });
});
