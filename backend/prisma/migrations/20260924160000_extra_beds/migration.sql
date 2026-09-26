-- AlterEnum
ALTER TYPE "ServiceChargeType" ADD VALUE 'PER_EXTRA_BED';

-- AlterTable
ALTER TABLE "Room" ADD COLUMN "maxExtraBeds" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Reservation" ADD COLUMN "extraBeds" INTEGER NOT NULL DEFAULT 0;