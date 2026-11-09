/*
  Warnings:

  - A unique constraint covering the columns `[notificationId,recipientEmail,recipientType]` on the table `NotificationDelivery` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "NotificationRecipientType" AS ENUM ('ADMIN', 'GUEST');

-- DropIndex
DROP INDEX "NotificationDelivery_notificationId_recipientEmail_key";

-- AlterTable
ALTER TABLE "NotificationDelivery" ADD COLUMN     "recipientType" "NotificationRecipientType" NOT NULL DEFAULT 'ADMIN';

-- CreateIndex
CREATE UNIQUE INDEX "NotificationDelivery_notificationId_recipientEmail_recipien_key" ON "NotificationDelivery"("notificationId", "recipientEmail", "recipientType");
