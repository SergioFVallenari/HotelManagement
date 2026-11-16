export type BillingProviderName = 'MERCADOPAGO';

export interface CreateBillingSubscriptionInput {
  accountId: number;
  contractId: number;
  payerEmail: string;
  amount: string;
  currency: 'ARS';
  returnUrl: string;
  idempotencyKey: string;
}

export interface ProviderSubscription {
  externalId: string;
  authorizationUrl: string | null;
  status: string;
}

export interface BillingProviderAdapter {
  createSubscription(input: CreateBillingSubscriptionInput): Promise<ProviderSubscription>;
  getSubscription(externalId: string): Promise<ProviderSubscription>;
  cancelSubscription(externalId: string): Promise<void>;
}
