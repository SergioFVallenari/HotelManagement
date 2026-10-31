CREATE TYPE "RoomPricingMode" AS ENUM ('PER_NIGHT', 'PER_PERSON');

ALTER TABLE "Room" ADD COLUMN "pricingMode" "RoomPricingMode" NOT NULL DEFAULT 'PER_NIGHT';
ALTER TABLE "Reservation"
  ADD COLUMN "roomPrice" DECIMAL(10,2),
  ADD COLUMN "roomPricingMode" "RoomPricingMode";
ALTER TABLE "BookingLink"
  ADD COLUMN "roomPrice" DECIMAL(10,2),
  ADD COLUMN "roomPricingMode" "RoomPricingMode";
