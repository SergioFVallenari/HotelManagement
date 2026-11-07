ALTER TYPE "ServiceChargeType" ADD VALUE 'PER_ROOM_INTERVAL';

ALTER TABLE "Service"
ADD COLUMN "description" TEXT,
ADD COLUMN "intervalDays" INTEGER;

ALTER TABLE "ReservationService"
ADD COLUMN "name" TEXT,
ADD COLUMN "description" TEXT,
ADD COLUMN "chargeType" "ServiceChargeType",
ADD COLUMN "intervalDays" INTEGER,
ADD COLUMN "isExtraBed" BOOLEAN;

UPDATE "ReservationService" AS line
SET "name" = service."name",
    "description" = service."description",
    "chargeType" = service."chargeType",
    "intervalDays" = service."intervalDays",
    "isExtraBed" = service."isExtraBed"
FROM "Service" AS service
WHERE service."id" = line."serviceId";
