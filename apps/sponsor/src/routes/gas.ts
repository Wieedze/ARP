import { checkGasLimits, planDepositApproval } from '@arp-protocol/core';
import { json, type Body, type SponsorContext } from './context.ts';

export async function gas(ctx: SponsorContext, body: Body): Promise<Response> {
  const {
    chainId,
    wallet,
    limits,
    ledger,
    now,
    multiVault,
    exclusive,
    ownerOfAgent,
    refuseOwnAgent,
    unconfirmed,
  } = ctx;
  const agent = await ownerOfAgent(body.agentRegistry, body.agentId);
  if ('error' in agent) return json({ error: agent.error }, agent.status);
  const own = refuseOwnAgent(agent.owner, body.agentId);
  if (own !== null) return own;
  return exclusive(async () => {
    const decision = checkGasLimits(ledger.relevant(now(), [agent.owner]), {
      agent: agent.owner,
      now: now(),
      limits,
    });
    if (!decision.ok) return json({ error: decision.reason }, 429);
    const key = `gas:${agent.owner.toLowerCase()}`;
    ledger.reserve({
      kind: 'gas',
      subject: agent.owner,
      value: limits.approvalGas,
      at: now(),
      key,
    });
    // A throw from here on leaves the reservation pending, which `checkGasLimits` counts as sent.
    const sent = await wallet.sendGas(agent.owner, limits.approvalGas);
    if (sent.status === 'unconfirmed') return unconfirmed('gas', key, sent.hash);
    if (sent.status !== 'success') {
      ledger.settle('gas', key, { status: 'reverted', hash: sent.hash });
      return json({ error: `gas transfer ${sent.hash} reverted` }, 502);
    }
    ledger.settle('gas', key, { status: 'success', hash: sent.hash });
    return json({
      sent: sent.hash,
      to: agent.owner,
      valueWei: limits.approvalGas,
      next: planDepositApproval({ multiVault, chainId, sponsor: wallet.address }),
    });
  });
}
