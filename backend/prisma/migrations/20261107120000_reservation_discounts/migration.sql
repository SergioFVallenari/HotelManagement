CREATE TYPE "DiscountType" AS ENUM ('PERCENTAGE', 'FIXED');

ALTER TABLE "Reservation"
  ADD COLUMN "discountType" "DiscountType",
  ADD COLUMN "discountValue" DECIMAL(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN "discountAmount" DECIMAL(10,2) NOT NULL DEFAULT 0;

ALTER TABLE "BookingLink"
  ADD COLUMN "discountType" "DiscountType",
  ADD COLUMN "discountValue" DECIMAL(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN "discountAmount" DECIMAL(10,2) NOT NULL DEFAULT 0;
