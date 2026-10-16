-- AlterEnum
ALTER TYPE "UserRole" ADD VALUE 'OWNER';
-- AlterTable
ALTER TABLE "Company" ADD COLUMN     "createdById" INTEGER;
-- AlterTable
ALTER TABLE "User" ADD COLUMN     "createdById" INTEGER;