ALTER TABLE "Guest" ALTER COLUMN "phone" DROP NOT NULL;
ALTER TABLE "Guest" ALTER COLUMN "email" DROP NOT NULL;

UPDATE "Guest" SET "phone" = NULL WHERE btrim("phone") = '';
UPDATE "Guest" SET "email" = NULL WHERE btrim("email") = '';
