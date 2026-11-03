import { planDepositApproval, spentOnDay } from '@arp-protocol/core';
import { SPONSOR_CHAIN_ID } from '../key-file.ts';
import { type SponsorContext } from './context.ts';

export function info(ctx: SponsorContext): Record<string, unknown> {
  const { options, chainId, wallet, limits, ledger, now, multiVault } = ctx;
  return {
    service: 'ARP sponsoring service',
    chainId,
    sponsor: wallet.address,
    receiptVerifier: wallet.address,
    multiVault,
    registries: [...options.registries],
    limits: {
      depositAmountWei: limits.depositAmount,
      depositsPerAgentPerDay: limits.depositsPerAgentPerDay,
      publicationsPerDelegatorPerDay: limits.publicationsPerDelegatorPerDay,
      dailyBudgetWei: limits.dailyBudget,
      approvalGasWei: limits.approvalGas,
      mintGasWei: limits.mintGas ?? 'off',
      newAgentsPerDay: limits.newAgentsPerDay,
      listingsPerAddressPerDay: limits.listingsPerAddressPerDay,
      anonymousListingsPerDay: limits.anonymousListingsPerDay,
      listingsPerDay: limits.listingsPerDay,
      categoriesPerDay: limits.categoriesPerDay,
      withdrawalThresholdBps: limits.withdrawalThresholdBps ?? 'unset',
      belowProofCost: limits.belowProofCost,
      spentTodayWei: spentOnDay(ledger.relevant(now()), now()),
      spentCounts: 'value sent only; the gas of the service’s own transactions is not counted',
      pendingSends: ledger.pending().length,
    },
    proofs: {
      hire: 'accepted: the payment on chain, and a v2 hire receipt signed by the hired agent’s holder or agentWallet, naming receiptVerifier as its verifyingContract and the deposit’s termId, unexpired. A v1 receipt, or one for another verifier, is refused. The edge must be (requester identity, uses, hired agent identity). The payment is a transfer: one operator holding both agents gets it back, so for that operator the bound is the daily count and budget, not the price.',
      content:
        options.acceptedContentSigners.length === 0
          ? 'no signer accepted'
          : chainId === SPONSOR_CHAIN_ID
            ? 'accepted on testnet: a content receipt signed by an accepted signer, naming the agent as its caller. The edge must be (requester identity, uses, the receipt’s tool atom). It attests access, not use (ADR 0109)'
            : 'verified, but refused until a fetch is bound to its payment (docs/tasks/41)',
    },
    approve: planDepositApproval({ multiVault, chainId, sponsor: wallet.address }),
    publish: options.publish === null ? 'disabled' : 'enabled',
    identity: (options.pinThing ?? null) === null ? 'disabled' : 'enabled',
    proposeCategory: (options.categories ?? null) === null ? 'disabled' : 'enabled',
    listTool:
      (options.pinThing ?? null) === null || (options.resolveTool ?? null) === null
        ? 'disabled'
        : 'enabled',
    note: 'Testnet 13579 only. Every deposit is made with the agent as receiver; the shares are the agent’s.',
  };
}
