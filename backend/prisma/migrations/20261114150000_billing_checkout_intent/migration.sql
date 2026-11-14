BEGIN;

ALTER TABLE "OwnerBillingContract" ADD COLUMN "requestKey" TEXT;
UPDATE "OwnerBillingContract" SET "requestKey" = 'legacy-contract-' || "id"::text;
ALTER TABLE "OwnerBillingContract" ALTER COLUMN "requestKey" SET NOT NULL;
ALTER TABLE "OwnerBillingContract" ADD COLUMN "checkoutUrl" TEXT;
CREATE UNIQUE INDEX "OwnerBillingContract_requestKey_key" ON "OwnerBillingContract"("requestKey");
CREATE UNIQUE INDEX "OwnerBillingContract_one_open_per_account" ON "OwnerBillingContract"("accountId") WHERE status IN ('PENDING', 'AUTHORIZED');

COMMIT;
