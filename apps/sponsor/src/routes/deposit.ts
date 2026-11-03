import {
  checkCreateLimits,
  checkDepositLimits,
  encodeCreateTriple,
  checkSponsorProof,
  planDepositApproval,
  planSponsoredDeposit,
  sponsoredPositions,
  sponsorProofDigest,
  verifySponsorRequest,
  withdrawnBps,
  type PreparedCall,
  type SignedSponsorRequest,
  type SponsorProof,
} from '@arp-protocol/core';
import { type Hex } from 'viem';
import { SPONSOR_CHAIN_ID } from '../key-file.ts';
import { chainUnreadable, json, isBytes32, type Body, type SponsorContext } from './context.ts';

export async function deposit(ctx: SponsorContext, body: Body): Promise<Response> {
  const {
    options,
    chainId,
    wallet,
    reads,
    payments,
    owners,
    limits,
    ledger,
    now,
    multiVault,
    exclusive,
    assertMultiVault,
    sendToMultiVault,
    ownerOfAgent,
    refuseOwnAgent,
    unconfirmed,
  } = ctx;
  const signed = body.request as SignedSponsorRequest; // Every field is checked by `verifySponsorRequest`.
  const proof = body.proof as SponsorProof; // Checked by `checkSponsorProof`, which refuses what it cannot read.
  const triple = body.triple as
    | { subjectId?: unknown; predicateId?: unknown; objectId?: unknown }
    | undefined; // Narrowed below.
  if (typeof signed !== 'object' || signed === null)
    return json({ error: 'request is required' }, 400);
  if (signed.chainId !== chainId) {
    return json(
      { error: `request is for chain ${String(signed.chainId)}, this service is on ${chainId}` },
      400,
    );
  }
  const verdict = await verifySponsorRequest(signed, Math.floor(now() / 1000));
  if (verdict.status !== 'valid')
    return json({ error: `request is ${verdict.status}`, verdict }, 401);
  const request = signed.request;
  const agent = verdict.agent;
  if (sponsorProofDigest(proof ?? null) !== request.proof.toLowerCase()) {
    return json({ error: 'the proof sent is not the proof the request signed' }, 400);
  }
  if (
    typeof triple !== 'object' ||
    triple === null ||
    !isBytes32(triple.subjectId) ||
    !isBytes32(triple.predicateId) ||
    !isBytes32(triple.objectId)
  ) {
    return json({ error: 'triple { subjectId, predicateId, objectId } is required' }, 400);
  }
  if (triple.predicateId.toLowerCase() !== options.usesPredicate.toLowerCase()) {
    return json({ error: 'a sponsored deposit is on a `uses` triple' }, 400);
  }

  const registered = await ownerOfAgent(request.agentRegistry, request.agentId);
  if ('unreadable' in registered) return registered.unreadable;
  if ('error' in registered) return json({ error: registered.error }, registered.status);
  if (registered.owner !== agent) {
    return json(
      { error: `agent ${request.agentId} is held by ${registered.owner}, not ${agent}` },
      403,
    );
  }
  const own = refuseOwnAgent(registered.owner, request.agentId);
  if (own !== null) return own;

  const tripleId = await reads.tripleId(triple.subjectId, triple.predicateId, triple.objectId);
  if (tripleId.toLowerCase() !== request.termId.toLowerCase()) {
    return json({ error: `termId is not the triple named (${tripleId})` }, 400);
  }

  const proven = await checkSponsorProof(proof, {
    receiver: agent,
    requester: { agentRegistry: request.agentRegistry, agentId: request.agentId },
    chainId,
    payments,
    acceptedContentSigners: options.acceptedContentSigners,
    acceptedRegistries: options.registries,
    agents: owners,
    // The service's own verifier is its sponsoring account: a hire receipt is accepted only when
    // it names that address, so a receipt the hirer had signed for `ReceiptEnforcer` is refused
    // here. An honest node's payment is sponsored once; a node that signs a second receipt for the
    // enforcer still gets both used, until this reads `isPaymentUsed` there (task 44, ADR 0101).
    receiptVerifier: wallet.address,
    termId: request.termId,
    now: Math.floor(now() / 1000),
  });
  // Nothing is known about a proof the chain could not be read for: try again, not refused.
  if (proven.status === 'unreadable') return chainUnreadable(proven.reason);
  if (proven.status !== 'proven') return json({ error: proven.reason }, 403);
  // An unpriced proof is refused, except a content receipt on testnet 13579 (ADR `0109`): there it
  // unlocks a deposit within the same count and budget. Mainnet keeps ADR `0096` until
  // `docs/tasks/41` binds a fetch to its payment.
  if (proven.cost === null && !(proven.kind === 'content' && chainId === SPONSOR_CHAIN_ID)) {
    return json(
      {
        error: `a ${proven.kind} proof has no price yet, so it cannot unlock a sponsorship (docs/tasks/41)`,
      },
      403,
    );
  }
  // ADR `0094` §2, a mainnet rule (off on testnet, where every proven hire is sponsored): a
  // sponsored amount stays below the cost of the proof that unlocks it. Between two operators
  // that makes a faked hire cost more than it earns; one operator holding both agents gets the
  // payment back, so for that one the bound is the daily count and the budget, not this. Nothing
  // is below an unknown price, so with the rule on an unpriced receipt is refused here too.
  if (limits.belowProofCost && (proven.cost === null || limits.depositAmount >= proven.cost)) {
    return json(
      {
        error:
          proven.cost === null
            ? `a ${proven.kind} proof has no price, and this service sponsors only below a proof's price`
            : `the proof cost ${proven.cost} wei, not more than the ${limits.depositAmount} sponsored`,
      },
      403,
    );
  }

  // The edge is the proof's: `(requester, uses, what the proof is about)`, both as atoms.
  const subjectRead = await options.identities.identityAtom({
    agentRegistry: request.agentRegistry,
    agentId: request.agentId,
  });
  if (subjectRead.status === 'none') {
    return json({ error: `agent ${request.agentId} has no identity atom on the graph` }, 403);
  }
  if (subjectRead.status === 'ambiguous') {
    return json({ error: `agent ${request.agentId}: ${subjectRead.reason}` }, 409);
  }
  const subject = subjectRead.atom;
  if (subject.toLowerCase() !== triple.subjectId.toLowerCase()) {
    return json(
      {
        error: `the triple's subject is not agent ${request.agentId}'s identity atom ${subject}`,
      },
      400,
    );
  }
  let object: Hex;
  if (proven.object.kind === 'atom') {
    object = proven.object.atom;
  } else {
    const objectRead = await options.identities.identityAtom(proven.object);
    if (objectRead.status === 'none') {
      return json(
        { error: 'the agent the proof says was hired has no identity atom on the graph' },
        403,
      );
    }
    if (objectRead.status === 'ambiguous') {
      return json({ error: `the agent the proof says was hired: ${objectRead.reason}` }, 409);
    }
    object = objectRead.atom;
  }
  if (object.toLowerCase() !== triple.objectId.toLowerCase()) {
    return json({ error: `the proof is about ${object}, not the object the triple names` }, 400);
  }
  // A second guard on the same case `checkSponsorProof` refuses by identity: two references that
  // resolve to one atom are one agent, and `(A, uses, A)` is not agent calls agent.
  if (subject.toLowerCase() === object.toLowerCase()) {
    return json({ error: 'the triple is the agent using itself, which no proof backs' }, 403);
  }

  return exclusive(async () => {
    if (ledger.has('deposit', proven.id))
      return json({ error: 'this proof already sponsored a deposit' }, 409);

    const positions = sponsoredPositions(ledger.relevant(now(), [agent]), agent);
    const held = await Promise.all(
      positions.map((p) => reads.sharesOf(agent, p.termId, p.curveId)),
    );
    const withdrawn = withdrawnBps(
      positions.map((p, i) => ({ sponsoredShares: p.shares, heldShares: held[i] ?? 0n })),
    );

    // A first declaration's `uses` triple does not exist yet. The service creates it, born with a
    // position of its own, and then deposits the agent's on it (ADR `0110`: « peu importe le
    // créateur, c'est le stake qui compte »). The deposit's limits are checked first, so a refused
    // deposit creates nothing.
    let created: Hex | null = null;
    if (!(await reads.termExists(request.termId))) {
      const early = checkDepositLimits(ledger.relevant(now(), [agent]), {
        agent,
        now: now(),
        limits,
        withdrawn,
      });
      if (!early.ok) return json({ error: early.reason }, 429);
      const [subjectExists, objectExists, tripleCost, minDeposit] = await Promise.all([
        reads.termExists(subject),
        reads.termExists(object),
        reads.tripleCost(),
        reads.minDeposit(),
      ]);
      if (!subjectExists || !objectExists) {
        return json({ error: "the triple's subject and object atoms must exist" }, 400);
      }
      const assets = tripleCost + minDeposit;
      // ADR `0053`, as `identity-plan.ts` enforces it: a term is born with a position or not at all.
      const born = await reads.previewTripleCreate(request.termId, assets);
      if (born.shares === 0n) {
        return json({ error: `creating ${request.termId} would buy 0 shares` }, 400);
      }
      const fits = checkCreateLimits(ledger.relevant(now(), [agent]), {
        agent,
        value: assets + limits.depositAmount,
        now: now(),
        limits,
      });
      if (!fits.ok) return json({ error: fits.reason }, 429);
      const create: PreparedCall = {
        kind: 'create-triple',
        chainId,
        to: multiVault,
        value: assets,
        data: encodeCreateTriple(subject, options.usesPredicate, object, assets),
        why: `the \`uses\` triple ${request.termId}, created for a sponsored deposit`,
      };
      assertMultiVault(create);
      const key = `create:${request.termId.toLowerCase()}`;
      // A creation whose outcome was lost holds the term until the operator reconciles it.
      if (ledger.has('create', key)) {
        return json(
          { error: `a creation of ${request.termId} is pending; it is reconciled by hand` },
          409,
        );
      }
      ledger.reserve({
        kind: 'create',
        subject: agent,
        value: assets,
        at: now(),
        key,
        termId: request.termId,
      });
      const sent = await sendToMultiVault(create);
      if (sent.status === 'unconfirmed') return unconfirmed('create', key, sent.hash);
      if (sent.status !== 'success') {
        ledger.settle('create', key, { status: 'reverted', hash: sent.hash });
        return json({ error: `creating ${request.termId}: ${sent.hash} reverted` }, 502);
      }
      ledger.settle('create', key, { status: 'success', hash: sent.hash });
      created = sent.hash;
    }

    let plan;
    try {
      plan = await planSponsoredDeposit({
        receiver: agent,
        termId: request.termId,
        amount: limits.depositAmount,
        reads,
      });
    } catch (error) {
      return json({ error: String(error instanceof Error ? error.message : error) }, 400);
    }

    const decision = checkDepositLimits(ledger.relevant(now(), [agent]), {
      agent,
      now: now(),
      limits,
      withdrawn,
    });
    // The same call the agent can send itself: `sender == receiver` needs no approval.
    if (!decision.ok) return json({ error: decision.reason, selfDeposit: plan.call }, 429);

    const simulated = await wallet.simulate(plan.call);
    if (!simulated.ok) {
      return json(
        {
          error: `the deposit does not simulate: ${simulated.reason}`,
          approve: planDepositApproval({ multiVault, chainId, sponsor: wallet.address }),
        },
        409,
      );
    }

    const before = await reads.sharesOf(agent, request.termId, plan.curveId);
    assertMultiVault(plan.call);
    ledger.reserve({
      kind: 'deposit',
      subject: agent,
      value: plan.call.value,
      at: now(),
      key: proven.id,
      termId: request.termId,
      curveId: plan.curveId,
    });
    // From here a throw leaves the proof spent: the deposit may have landed.
    const sent = await sendToMultiVault(plan.call);
    if (sent.status === 'unconfirmed') return unconfirmed('deposit', proven.id, sent.hash);
    if (sent.status !== 'success') {
      ledger.settle('deposit', proven.id, { status: 'reverted', hash: sent.hash });
      return json({ error: `deposit ${sent.hash} reverted` }, 502);
    }
    // A failing read must not leave a mined deposit unsettled: the shares stay unknown instead,
    // and `sponsoredPositions` skips a row without them.
    const after = await reads.sharesOf(agent, request.termId, plan.curveId).catch(() => null);
    const shares = after === null ? null : after > before ? after - before : 0n;
    ledger.settle('deposit', proven.id, {
      status: 'success',
      hash: sent.hash,
      ...(shares === null ? {} : { shares }),
    });
    return json({
      sent: sent.hash,
      receiver: agent,
      termId: request.termId,
      valueWei: plan.call.value,
      shares,
      proof: { kind: proven.kind, strength: proven.strength },
      ...(created === null ? {} : { created }),
    });
  });
}
