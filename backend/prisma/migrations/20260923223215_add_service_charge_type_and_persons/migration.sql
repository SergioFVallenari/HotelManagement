-- CreateEnum
CREATE TYPE "ServiceChargeType" AS ENUM ('PER_PERSON', 'PER_DAY', 'PACK');

-- AlterTable
ALTER TABLE "Reservation" ADD COLUMN     "persons" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "Service" ADD COLUMN     "chargeType" "ServiceChargeType" NOT NULL DEFAULT 'PACK';
