/*
  Warnings:

  - The primary key for the `NotificationDelivery` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The `id` column on the `NotificationDelivery` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- AlterTable
ALTER TABLE "NotificationDelivery" DROP CONSTRAINT "NotificationDelivery_pkey",
DROP COLUMN "id",
ADD COLUMN     "id" UUID NOT NULL DEFAULT gen_random_uuid(),
ADD CONSTRAINT "NotificationDelivery_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "Reservation" ADD COLUMN     "depositRequired" DECIMAL(10,2),
ADD COLUMN     "totalAmount" DECIMAL(10,2);
