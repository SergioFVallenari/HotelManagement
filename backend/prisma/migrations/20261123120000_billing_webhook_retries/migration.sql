ALTER TABLE "OwnerBillingWebhookEvent"
  ADD COLUMN "nextAttemptAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "lockedUntil" TIMESTAMP(3);

UPDATE "OwnerBillingWebhookEvent"
SET "nextAttemptAt" = NULL
WHERE "status" = 'PROCESSED';

CREATE INDEX "OwnerBillingWebhookEvent_provider_topic_status_nextAttemptAt_idx"
ON "OwnerBillingWebhookEvent" ("provider", "topic", "status", "nextAttemptAt");
