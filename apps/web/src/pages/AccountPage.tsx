import {useEffect, useId, useRef, useState} from "react";
import {type Delegation} from "@metamask/smart-accounts-kit";

import {DelegationForm} from "../components/account/DelegationForm";
import {ChainToggle} from "../components/brand/ChainToggle";
import {Hint} from "../components/brand/Hint";
import {
    useAccountDelegations,
    type AccountDelegations,
    type DelegationRow,
} from "../hooks/use-account-delegations";
import {useChainChoice} from "../lib/chain-choice";
import {intuitionTestnet} from "../lib/chains";
import {controlClass, linkClass, primaryControlClass} from "../lib/control-class";
import {deployments} from "../lib/deployments";
import {exportDelegation} from "../services/delegation-store";
import {formatPeriod, type CaveatView} from "../services/delegation-view";
import {formatTrust} from "../services/trust-format";

/**
 * `/account`: what the operator **has authorised and configured** — the wallet, the Smart Account
 * derived from it, the delegations it signed, and the runtime those delegations name. No figure of
 * what happened: positions and history are `/activity`'s (`docs/tasks/35` §1).
 *
 * **Signing and revoking are testnet 13579 only** (`docs/tasks/35` §4.2, ADR `0092`): ADR `0036`
 * allows delegated staking on 1155 once the path is proven on testnet end to end, and it has not
 * been. On mainnet the page shows the toggle and the stored rows, and nothing that signs.
 *
 * Every signature here is a click on a confirmation that names the chain. Nothing is signed on
 * load, and no key is held: a signed delegation is not redeemable without its delegate's key.
 */
const LABEL = "font-mono text-[10px] uppercase tracking-[0.06em] text-[color:var(--color-steel)]";
const CELL = "font-mono text-[length:var(--text-body-sm)] leading-[1.6]";
const TH = `${LABEL} pb-2 pr-4 text-left font-normal`;
const TD = `${CELL} border-t border-[color:var(--color-rule)] py-2 pr-4 align-top`;
const TESTNET = `${intuitionTestnet.name} (${intuitionTestnet.id})`;

function short(value: string): string {
    return `${value.slice(0, 6)}…${value.slice(-4)}`;
}

function errorText(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

export function AccountPage({
    account: injected,
}: {
    /** The page's data and acts, injected by a test; the hook otherwise. */
    account?: AccountDelegations;
} = {}) {
    // A test passes `account`; the app never does, so the hook's order of calls is stable per mount.
    return injected === undefined ? <LiveAccountPage /> : <AccountView account={injected} />;
}

function LiveAccountPage() {
    const account = useAccountDelegations();
    return <AccountView account={account} />;
}

function AccountView({account}: {account: AccountDelegations}) {
    const chain = useChainChoice();
    // The page's toggle is on testnet and the wallet is too: the only state in which it signs.
    const canSign = !chain.isMainnet && account.onTestnet && account.smartAccount !== null;

    return (
        <section>
            <header className="pt-14 pb-10">
                <h1 className="type-display">Account</h1>
            </header>

            {account.operator === undefined ? (
                <p className="text-[color:var(--color-steel)]">
                    Connect a wallet to see its agent wallet and permissions.
                </p>
            ) : (
                <div className="max-w-[60rem] space-y-14">
                    <WalletSection account={account} canSign={canSign} />
                    <DelegationsSection account={account} canSign={canSign} />
                    <NewDelegationSection account={account} canSign={canSign} />
                    <RuntimeSection account={account} />
                </div>
            )}
        </section>
    );
}

function SigningGate({account}: {account: AccountDelegations}) {
    const chain = useChainChoice();
    if (chain.isMainnet) {
        return (
            <p className={`${CELL} flex items-center gap-2 text-[color:var(--color-steel)]`}>
                Signing: testnet only
                <Hint label="Why signing is testnet only">
                    Support under a permission waits on mainnet until it is proven on testnet end to
                    end (ADR 0036).
                </Hint>
            </p>
        );
    }
    if (!account.onTestnet) {
        return (
            <div>
                <button
                    type="button"
                    className={controlClass}
                    disabled={account.switchToTestnet.isPending}
                    onClick={() => account.switchToTestnet.mutate()}
                >
                    Switch wallet to {intuitionTestnet.name}
                </button>
                {account.switchToTestnet.error === null ? null : (
                    <p role="alert" className={`${CELL} mt-3`}>
                        {errorText(account.switchToTestnet.error)}
                    </p>
                )}
            </div>
        );
    }
    return null;
}

function WalletSection({account, canSign}: {account: AccountDelegations; canSign: boolean}) {
    const sa = account.smartAccount;
    return (
        <div>
            <h2 className={`${LABEL} mb-3`}>Wallet and agent wallet</h2>
            <dl className="grid grid-cols-[10rem_1fr] gap-x-6 gap-y-3 text-[length:var(--text-body-sm)]">
                <dt className={LABEL}>Wallet</dt>
                <dd className="font-mono break-all">{account.operator}</dd>
                <dt className={LABEL}>Agent wallet</dt>
                <dd className="font-mono break-all">
                    {sa === null
                        ? account.smartAccountError === null
                            ? "deriving…"
                            : `could not derive: ${errorText(account.smartAccountError)}`
                        : sa.address}
                </dd>
                <dt className={LABEL}>Deployed on 13579</dt>
                <dd className="font-mono">
                    {sa === null ? "—" : sa.isDeployed ? "yes" : "no"}
                    {sa !== null && !sa.isDeployed && canSign ? (
                        <button
                            type="button"
                            className={`${controlClass} ml-4`}
                            disabled={account.deploy.isPending}
                            onClick={() => account.deploy.mutate()}
                        >
                            {account.deploy.isPending
                                ? "Deploying…"
                                : `Deploy on ${intuitionTestnet.name}`}
                        </button>
                    ) : null}
                    {account.deploy.error === null ? null : (
                        <span role="alert" className="block">
                            {errorText(account.deploy.error)}
                        </span>
                    )}
                </dd>
                <dt className={LABEL}>Chain</dt>
                <dd>
                    <ChainToggle />
                </dd>
            </dl>
            <div className="mt-4">
                <SigningGate account={account} />
            </div>
        </div>
    );
}

/**
 * The contract that checks a limit, kept reachable as an explorer link rather than in the row.
 * A link, not a `Hint`: an address inside a hint cannot be selected or copied (ADR `0103`).
 * Permissions exist on testnet only, so the explorer is the testnet deployment's.
 */
function CheckedBy({name, address}: {name: string; address: string}) {
    return (
        <a
            href={`${deployments.chain.explorerUrl}/address/${address}`}
            target="_blank"
            rel="noreferrer"
            aria-label={`Contract that checks this limit: ${name} ${address}`}
            className={`text-[length:var(--text-body-sm)] ${linkClass}`}
        >
            contract ↗
        </a>
    );
}

function Caveat({caveat}: {caveat: CaveatView}) {
    if (caveat.kind === "stake-cap") {
        return (
            <span className="flex items-center gap-2">
                {formatTrust(caveat.cap)} tTRUST / {formatPeriod(caveat.periodSeconds)}
                <CheckedBy name="TrustStakeCap" address={caveat.enforcer} />
            </span>
        );
    }
    return (
        <span className="flex items-center gap-2 text-[color:var(--color-steel)]">
            {caveat.kind === "named" ? caveat.name : "unknown limit"}
            <CheckedBy
                name={caveat.kind === "named" ? caveat.name : "unknown"}
                address={caveat.enforcer}
            />
        </span>
    );
}

const STATE: Record<DelegationRow["state"], string> = {
    enabled: "active",
    disabled: "revoked",
    unknown: "unknown",
    loading: "reading…",
};

function DelegationLine({
    row,
    account,
    canSign,
}: {
    row: DelegationRow;
    account: AccountDelegations;
    canSign: boolean;
}) {
    const [confirming, setConfirming] = useState(false);
    // Opening the confirmation unmounts the Revoke button that had focus, and closing it unmounts
    // the confirmation's, so focus is placed by hand both ways or it falls to <body>. A settled
    // revoke goes to Export rather than Revoke: once the state is re-read the row has no Revoke.
    const returnFocus = useRef<"revoke" | "export" | null>(null);
    const revokeRef = useRef<HTMLButtonElement>(null);
    const exportRef = useRef<HTMLButtonElement>(null);
    useEffect(() => {
        if (confirming || returnFocus.current === null) return;
        const target = returnFocus.current === "revoke" ? revokeRef.current : null;
        (target ?? exportRef.current)?.focus();
        returnFocus.current = null;
    }, [confirming]);
    const [copy, setCopy] = useState<"idle" | "copied" | "failed">("idle");
    useEffect(() => {
        if (copy !== "copied") return;
        const timer = setTimeout(() => setCopy("idle"), 2_000);
        return () => clearTimeout(timer);
    }, [copy]);
    const revoking = account.revoke.isPending && account.revoke.variables === row.stored.delegation;
    const signedAt = new Date(row.stored.signedAt * 1000)
        .toISOString()
        .slice(0, 16)
        .replace("T", " ");

    return (
        <>
            <tr>
                <td className={`${TD} break-all`}>{row.view.delegate}</td>
                <td className={TD}>
                    {row.view.caveats.map((caveat, index) => (
                        <Caveat key={`${caveat.enforcer}-${index}`} caveat={caveat} />
                    ))}
                </td>
                <td className={`${TD} tabular-nums text-[color:var(--color-silver)]`}>
                    {signedAt}
                </td>
                <td className={TD}>
                    <span
                        className={
                            row.state === "enabled"
                                ? "text-[color:var(--color-fg)]"
                                : "text-[color:var(--color-steel)]"
                        }
                    >
                        {STATE[row.state]}
                    </span>
                    <span className="block text-[color:var(--color-steel)]">local only</span>
                </td>
                <td className={`${TD} whitespace-nowrap text-right`}>
                    {canSign && row.state === "enabled" && !confirming ? (
                        <button
                            ref={revokeRef}
                            type="button"
                            className={`${controlClass} mr-2`}
                            onClick={() => setConfirming(true)}
                        >
                            Revoke
                        </button>
                    ) : null}
                    <button
                        ref={exportRef}
                        type="button"
                        className={controlClass}
                        onClick={() => {
                            setCopy("idle");
                            // Inside the promise chain, so no clipboard at all (insecure context)
                            // rejects like a refused write instead of throwing out of the handler.
                            Promise.resolve()
                                .then(() =>
                                    navigator.clipboard.writeText(
                                        exportDelegation(row.stored.delegation),
                                    ),
                                )
                                .then(
                                    () => setCopy("copied"),
                                    () => setCopy("failed"),
                                );
                        }}
                    >
                        {copy === "copied" ? "Copied" : "Export"}
                    </button>
                    {copy === "failed" ? (
                        <span role="alert" className="block text-[color:var(--color-steel)]">
                            Copy failed
                        </span>
                    ) : null}
                </td>
            </tr>
            {confirming ? (
                <tr>
                    <td colSpan={5} className={`${TD} border-t-0`}>
                        <RevokeConfirm
                            delegation={row.stored.delegation}
                            pending={revoking}
                            onCancel={() => {
                                returnFocus.current = "revoke";
                                setConfirming(false);
                            }}
                            onConfirm={() =>
                                account.revoke.mutate(row.stored.delegation, {
                                    onSettled: () => {
                                        returnFocus.current = "export";
                                        setConfirming(false);
                                    },
                                })
                            }
                        />
                    </td>
                </tr>
            ) : null}
        </>
    );
}

function RevokeConfirm({
    delegation,
    pending,
    onCancel,
    onConfirm,
}: {
    delegation: Delegation;
    pending: boolean;
    onCancel: () => void;
    onConfirm: () => void;
}) {
    const summaryId = useId();
    const confirmRef = useRef<HTMLButtonElement>(null);
    // The Revoke click that opened this unmounted the focused button; focus lands on the act, and
    // the sentence is its description, so a screen reader reads what is about to be signed.
    useEffect(() => confirmRef.current?.focus(), []);
    return (
        <div role="group" aria-label="Confirm revocation" className="space-y-3">
            <p id={summaryId}>
                Revoke on {TESTNET}: your agent wallet signs a one-call permission, then your wallet
                sends <span className="font-mono">disableDelegation</span> to{" "}
                <span className="font-mono">
                    {short(deployments.metamaskDelegationFramework.delegationManager)}
                </span>
                . Agent address <span className="font-mono">{short(delegation.delegate)}</span> can
                no longer use it.
            </p>
            <div className="flex gap-3">
                <button
                    ref={confirmRef}
                    type="button"
                    className={primaryControlClass}
                    aria-describedby={summaryId}
                    disabled={pending}
                    onClick={onConfirm}
                >
                    {pending ? "Revoking…" : "Revoke in wallet"}
                </button>
                <button
                    type="button"
                    className={controlClass}
                    disabled={pending}
                    onClick={onCancel}
                >
                    Cancel
                </button>
            </div>
        </div>
    );
}

function DelegationsSection({account, canSign}: {account: AccountDelegations; canSign: boolean}) {
    return (
        <div>
            <h2 className={`${LABEL} mb-2`} id="account-delegations">
                Permissions
            </h2>
            {account.rows.length === 0 ? (
                <p
                    className={`${CELL} border-t border-[color:var(--color-rule)] py-3 text-[color:var(--color-steel)]`}
                >
                    None in this browser. A permission you sign below appears here.
                </p>
            ) : (
                <table aria-labelledby="account-delegations" className="w-full border-collapse">
                    <thead>
                        <tr>
                            <th scope="col" className={TH}>
                                Agent address
                            </th>
                            <th scope="col" className={TH}>
                                Limits
                            </th>
                            <th scope="col" className={`${TH} w-[9.5rem]`}>
                                Signed (UTC)
                            </th>
                            <th scope="col" className={`${TH} w-[7rem]`}>
                                State
                            </th>
                            <th scope="col" className={`${TH} w-[11rem] text-right`}>
                                <span className="sr-only">Actions</span>
                            </th>
                        </tr>
                    </thead>
                    <tbody>
                        {account.rows.map((row) => (
                            <DelegationLine
                                key={row.view.hash}
                                row={row}
                                account={account}
                                canSign={canSign}
                            />
                        ))}
                    </tbody>
                </table>
            )}
            {account.revoke.error === null ? null : (
                <p role="alert" className={`${CELL} mt-3`}>
                    {errorText(account.revoke.error)}
                </p>
            )}
        </div>
    );
}

function NewDelegationSection({account, canSign}: {account: AccountDelegations; canSign: boolean}) {
    const deployed = account.smartAccount?.isDeployed === true;
    // Bumped on a successful signature, which remounts the form at its first step: the confirmation
    // must not survive with a live sign control, because each sign draws a fresh salt and a second
    // click would sign a second, distinct delegation.
    const [signedCount, setSignedCount] = useState(0);
    return (
        <div>
            <h2 className={`${LABEL} mb-3`}>New permission</h2>
            {!canSign ? (
                <p className={`${CELL} text-[color:var(--color-steel)]`}>
                    {account.smartAccount === null
                        ? "Agent wallet not derived yet"
                        : "Not on 13579"}
                </p>
            ) : !deployed ? (
                <p className={`${CELL} text-[color:var(--color-steel)]`}>
                    Deploy the agent wallet first.
                </p>
            ) : (
                <>
                    <DelegationForm
                        key={`${account.suggestedDelegate ?? "none"}-${signedCount}`}
                        suggestedDelegate={account.suggestedDelegate}
                        chainName={intuitionTestnet.name}
                        chainId={intuitionTestnet.id}
                        symbol="tTRUST"
                        pending={account.sign.isPending}
                        onSign={(request) =>
                            account.sign.mutate(request, {
                                onSuccess: () => setSignedCount((count) => count + 1),
                            })
                        }
                    />
                    {account.sign.error === null ? null : (
                        <p role="alert" className={`${CELL} mt-3`}>
                            {errorText(account.sign.error)}
                        </p>
                    )}
                </>
            )}
        </div>
    );
}

function RuntimeSection({account}: {account: AccountDelegations}) {
    return (
        <div>
            <h2 className={`${LABEL} mb-3`}>Agent runtime</h2>
            {account.runtimes.length === 0 ? (
                <p className={`${CELL} text-[color:var(--color-steel)]`}>
                    No agent address yet. The address a permission names appears here with its
                    balance.
                </p>
            ) : (
                <dl className="grid grid-cols-[1fr_auto] gap-x-6 gap-y-2 text-[length:var(--text-body-sm)]">
                    {account.runtimes.map((runtime) => (
                        <div key={runtime.address} className="contents">
                            <dt className="font-mono break-all">{runtime.address}</dt>
                            <dd className="font-mono tabular-nums text-right">
                                {runtime.balance === undefined
                                    ? "—"
                                    : `${formatTrust(runtime.balance)} tTRUST`}
                            </dd>
                        </div>
                    ))}
                </dl>
            )}
        </div>
    );
}
