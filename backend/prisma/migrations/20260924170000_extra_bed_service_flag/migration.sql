-- Recreate the enum type without the unused value (Postgres cannot drop a value in place).
ALTER TYPE "ServiceChargeType" RENAME TO "ServiceChargeType_old";
CREATE TYPE "ServiceChargeType" AS ENUM ('PER_PERSON', 'PER_DAY', 'PACK');
ALTER TABLE "Service" ALTER COLUMN "chargeType" DROP DEFAULT;
ALTER TABLE "Service" ALTER COLUMN "chargeType" TYPE "ServiceChargeType" USING ("chargeType"::text::"ServiceChargeType");
ALTER TABLE "Service" ALTER COLUMN "chargeType" SET DEFAULT 'PACK';
DROP TYPE "ServiceChargeType_old";

-- Mark which PER_DAY service represents the hotel's extra bed.
-- Extra beds are charged Por día; the count of beds comes from Reservation.extraBeds.
ALTER TABLE "Service" ADD COLUMN "isExtraBed" BOOLEAN NOT NULL DEFAULT false;