-- AddSequence
CREATE SEQUENCE "CompanyMpAccount_id_seq";

-- AlterTable
ALTER TABLE "CompanyMpAccount" ALTER COLUMN "id" SET DEFAULT nextval('"CompanyMpAccount_id_seq"');

-- AlterSequence
ALTER SEQUENCE "CompanyMpAccount_id_seq" OWNED BY "CompanyMpAccount"."id";
