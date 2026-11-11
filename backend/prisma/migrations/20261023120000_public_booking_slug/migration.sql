ALTER TABLE "Company" ADD COLUMN "bookingSlug" TEXT;
CREATE UNIQUE INDEX "Company_bookingSlug_key" ON "Company"("bookingSlug");
