import {
  checkMintGasLimits,
  verifyMintGasRequest,
  type SignedMintGasRequest,
} from '@arp-protocol/core';
import { getAddress } from 'viem';
import { json, ZERO_ADDRESS, type Body, type SponsorContext } from './context.ts';

/**
 * Gas for an address's own `register()`, before it is an agent (ADR `0110`). The request is
 * signed by the address that receives the gas (ADR `0116`): a bare address let anyone spend the
 * day's cap of new agents on addresses nobody holds.
 */
export async function mintGas(ctx: SponsorContext, body: Body): Promise<Response> {
  const { options, chainId, wallet, limits, ledger, now, multiVault, exclusive, unconfirmed } = ctx;
  const signed = body.request;
  if (typeof signed !== 'object' || signed === null) {
    return json({ error: 'request (a signed MintGasRequest) is required' }, 400);
  }
  const verdict = await verifyMintGasRequest(signed, Math.floor(now() / 1000));
  if (verdict.status !== 'valid')
    return json({ error: `request is ${verdict.status}`, verdict }, 401);
  // Checked by `verifyMintGasRequest`, which reads every field before it recovers the signer.
  const { chainId: signedChain, request } = signed as SignedMintGasRequest;
  if (signedChain !== chainId) {
    return json(
      { error: `request is for chain ${signedChain}, this service is on ${chainId}` },
      400,
    );
  }
  const address = verdict.address;
  const nonceKey = `mint-gas-nonce:${request.nonce.toLowerCase()}`;
  if (address === getAddress(wallet.address)) {
    return json({ error: 'the sponsoring service sends no gas to itself' }, 403);
  }
  if (address === ZERO_ADDRESS || address === multiVault) {
    return json({ error: `${address} cannot register an agent` }, 400);
  }
  // Mint gas is for an address about to register. One that already holds an agent is not.
  if ((await options.holdings.agentsHeldBy(address)) > 0n) {
    return json({ error: `${address} already holds an agent; ask /gas instead` }, 403);
  }
  return exclusive(async () => {
    // Each signed request is spent once, whatever its outcome, so a request seen once cannot be
    // sent again by whoever saw it.
    if (ledger.has('mint-gas', nonceKey))
      return json({ error: 'this request was already used' }, 409);
    const decision = checkMintGasLimits(ledger.relevant(now(), [address]), {
      address,
      now: now(),
      limits,
    });
    if (!decision.ok) {
      return json({ error: decision.reason }, limits.mintGas === null ? 503 : 429);
    }
    const value = limits.mintGas ?? 0n; // Not null: `checkMintGasLimits` refused that above.
    const key = nonceKey;
    ledger.reserve({ kind: 'mint-gas', subject: address, value, at: now(), key });
    const sent = await wallet.sendGas(address, value);
    if (sent.status === 'unconfirmed') return unconfirmed('mint-gas', key, sent.hash);
    if (sent.status !== 'success') {
      ledger.settle('mint-gas', key, { status: 'reverted', hash: sent.hash });
      return json({ error: `gas transfer ${sent.hash} reverted` }, 502);
    }
    ledger.settle('mint-gas', key, { status: 'success', hash: sent.hash });
    return json({ sent: sent.hash, to: address, valueWei: value });
  });
}
