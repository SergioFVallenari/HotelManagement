import { prisma } from '../../config/prisma.js';
import { env } from '../../config/env.js';
import { inspectPendingCheckout } from './providers/billingCheckoutInspection.js';
import { inspectMercadoPagoSubscriptions } from './providers/mercadoPagoSearch.js';

export async function inspectTestPendingCheckout(ownerId: number, transport: typeof fetch = fetch) {
  const config = env.billingMpTest;
  return inspectPendingCheckout(ownerId, {
    findPending: async (id) => {
      const contract = await prisma.ownerBillingContract.findFirst({
        where: { account: { ownerId: id }, status: 'PENDING' },
        select: { id: true, status: true, provider: true, providerSubscriptionId: true, checkoutUrl: true, amount: true, currency: true, intervalMonths: true, account: { select: { ownerId: true, owner: { select: { email: true } } } } },
      });
      return contract ? { ...contract, ownerId: contract.account.ownerId, currentOwnerEmail: contract.account.owner.email, amount: contract.amount.toFixed(2) } : null;
    },
    search: () => inspectMercadoPagoSubscriptions({ enabled: config.enabled, environment: env.appEnv, accessToken: config.accessToken, transport }),
  });
}
