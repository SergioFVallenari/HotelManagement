BEGIN;

ALTER TABLE "OwnerBillingPeriod" ADD COLUMN "paymentId" INTEGER;
ALTER TABLE "OwnerBillingPeriod" ADD COLUMN "providerInstallmentId" TEXT;
ALTER TABLE "OwnerBillingPeriod" ADD COLUMN "providerScheduledAt" TIMESTAMP(3);
ALTER TABLE "OwnerBillingPeriod" ADD CONSTRAINT "OwnerBillingPeriod_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "OwnerBillingPayment"("id") ON DELETE RESTRICT;
CREATE UNIQUE INDEX "OwnerBillingPeriod_paymentId_key" ON "OwnerBillingPeriod"("paymentId");
CREATE UNIQUE INDEX "OwnerBillingPeriod_contractId_providerInstallmentId_key" ON "OwnerBillingPeriod"("contractId", "providerInstallmentId");

COMMIT;
