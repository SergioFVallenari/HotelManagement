import { subscriptionTransition, verifyBillingSubscription, type SubscriptionContract, type VerifiedSubscription } from './billingSubscription.js';
import type { RecordedSubscriptionState } from '../billing.subscriptionPersistence.js';

export interface SubscriptionSyncInput {
  contractId: number;
  apply: boolean;
}

interface SyncConfig {
  environment: string;
  databaseUrl: string;
  enabled: boolean;
}

export function parseSubscriptionSyncArgs(args: readonly string[]): SubscriptionSyncInput {
  const contractId = Number(args[0]);
  if ((args.length !== 1 && args.length !== 2) || !/^[1-9]\d*$/.test(args[0] ?? '') || !Number.isSafeInteger(contractId) || (args.length === 2 && args[1] !== '--apply')) {
    throw new Error('Uso: billing:sync-subscription <contractId> [--apply]');
  }
  return { contractId, apply: args[1] === '--apply' };
}

export function assertSubscriptionSyncConfig(config: SyncConfig): void {
  const database = new URL(config.databaseUrl);
  if (config.environment !== 'testing' || !config.enabled || !['postgres:', 'postgresql:'].includes(database.protocol) || database.username !== 'postgres.sowbuvdeampxsbpgtgvo' || !database.hostname.endsWith('.pooler.supabase.com')) {
    throw new Error('La sincronización requiere el proyecto de testing verificado.');
  }
}

export async function syncTestSubscription(input: SubscriptionSyncInput, dependencies: {
  config: SyncConfig;
  now: Date;
  findContract: (contractId: number) => Promise<SubscriptionContract | null>;
  readSubscription: (resourceId: string) => Promise<unknown>;
  readIdentity: () => Promise<unknown>;
  record: (subscription: VerifiedSubscription) => Promise<RecordedSubscriptionState>;
}) {
  assertSubscriptionSyncConfig(dependencies.config);
  if (!Number.isSafeInteger(input.contractId) || input.contractId <= 0 || typeof input.apply !== 'boolean') throw new Error('La solicitud de sincronización no es válida.');
  const contract = await dependencies.findContract(input.contractId);
  if (!contract || contract.id !== input.contractId || !contract.providerSubscriptionId) return { result: 'REVIEW' as const, reason: 'CONTRACT_UNAVAILABLE' };
  const verified = await verifyBillingSubscription(contract.providerSubscriptionId, {
    now: dependencies.now,
    findContract: async (resourceId) => resourceId === contract.providerSubscriptionId ? contract : null,
    readSubscription: dependencies.readSubscription,
    readIdentity: dependencies.readIdentity,
  });
  if (verified.result === 'REVIEW') return verified;
  const transition = subscriptionTransition(contract, verified.subscription);
  if (transition.result === 'REVIEW') return transition;
  if (!input.apply) {
    return { result: 'VERIFIED_NOT_APPLIED' as const, contractId: contract.id, localStatus: contract.status, providerStatus: verified.subscription.status, providerUpdatedAt: verified.subscription.providerUpdatedAt, transition: transition.result };
  }
  const recorded = await dependencies.record(verified.subscription);
  return { contractId: contract.id, ...recorded };
}
