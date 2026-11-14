BEGIN;

CREATE TYPE "OwnerBillingContractStatus" AS ENUM ('PENDING', 'AUTHORIZED', 'PAUSED', 'CANCELED');
CREATE TYPE "OwnerBillingPaymentStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'REFUNDED');
CREATE TYPE "OwnerBillingWebhookStatus" AS ENUM ('RECEIVED', 'PROCESSED', 'FAILED');

CREATE TABLE "OwnerBillingContract" (
  "id" SERIAL PRIMARY KEY,
  "accountId" INTEGER NOT NULL REFERENCES "OwnerBillingAccount"("id") ON DELETE RESTRICT,
  "provider" TEXT NOT NULL,
  "providerSubscriptionId" TEXT,
  "status" "OwnerBillingContractStatus" NOT NULL DEFAULT 'PENDING',
  "amount" DECIMAL(12,2) NOT NULL CHECK ("amount" > 0),
  "currency" VARCHAR(3) NOT NULL,
  "intervalMonths" INTEGER NOT NULL DEFAULT 1 CHECK ("intervalMonths" > 0),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE UNIQUE INDEX "OwnerBillingContract_provider_providerSubscriptionId_key" ON "OwnerBillingContract"("provider", "providerSubscriptionId");
CREATE INDEX "OwnerBillingContract_accountId_createdAt_idx" ON "OwnerBillingContract"("accountId", "createdAt");

CREATE TABLE "OwnerBillingPeriod" (
  "id" SERIAL PRIMARY KEY,
  "contractId" INTEGER NOT NULL REFERENCES "OwnerBillingContract"("id") ON DELETE RESTRICT,
  "startsAt" TIMESTAMP(3) NOT NULL,
  "endsAt" TIMESTAMP(3) NOT NULL,
  "amount" DECIMAL(12,2) NOT NULL CHECK ("amount" > 0),
  "currency" VARCHAR(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OwnerBillingPeriod_dates_check" CHECK ("endsAt" > "startsAt")
);
CREATE UNIQUE INDEX "OwnerBillingPeriod_contractId_startsAt_key" ON "OwnerBillingPeriod"("contractId", "startsAt");

CREATE TABLE "OwnerBillingPayment" (
  "id" SERIAL PRIMARY KEY,
  "contractId" INTEGER NOT NULL REFERENCES "OwnerBillingContract"("id") ON DELETE RESTRICT,
  "provider" TEXT NOT NULL,
  "providerPaymentId" TEXT,
  "status" "OwnerBillingPaymentStatus" NOT NULL DEFAULT 'PENDING',
  "amount" DECIMAL(12,2) NOT NULL CHECK ("amount" > 0),
  "currency" VARCHAR(3) NOT NULL,
  "paidAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE UNIQUE INDEX "OwnerBillingPayment_provider_providerPaymentId_key" ON "OwnerBillingPayment"("provider", "providerPaymentId");
CREATE INDEX "OwnerBillingPayment_contractId_createdAt_idx" ON "OwnerBillingPayment"("contractId", "createdAt");

CREATE TABLE "OwnerBillingWebhookEvent" (
  "id" SERIAL PRIMARY KEY,
  "provider" TEXT NOT NULL,
  "providerNotificationId" TEXT,
  "topic" TEXT NOT NULL,
  "resourceId" TEXT NOT NULL,
  "status" "OwnerBillingWebhookStatus" NOT NULL DEFAULT 'RECEIVED',
  "attempts" INTEGER NOT NULL DEFAULT 0 CHECK ("attempts" >= 0),
  "lastError" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "processedAt" TIMESTAMP(3)
);
CREATE UNIQUE INDEX "OwnerBillingWebhookEvent_provider_providerNotificationId_key" ON "OwnerBillingWebhookEvent"("provider", "providerNotificationId");
CREATE INDEX "OwnerBillingWebhookEvent_status_createdAt_idx" ON "OwnerBillingWebhookEvent"("status", "createdAt");

ALTER TABLE "OwnerBillingContract" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "OwnerBillingPeriod" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "OwnerBillingPayment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "OwnerBillingWebhookEvent" ENABLE ROW LEVEL SECURITY;

COMMIT;
