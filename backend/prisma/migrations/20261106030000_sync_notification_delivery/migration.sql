ALTER TABLE "NotificationDelivery"
ALTER COLUMN "id"
SET DEFAULT (gen_random_uuid())::text;

ALTER TABLE "NotificationDelivery"
ALTER COLUMN "updatedAt"
SET DEFAULT CURRENT_TIMESTAMP;