BEGIN;

CREATE TABLE "OwnerBillingAccount" (
  "id" SERIAL PRIMARY KEY,
  "ownerId" INTEGER NOT NULL UNIQUE REFERENCES "User"("id") ON DELETE RESTRICT,
  "status" "BillingSubscriptionStatus" NOT NULL,
  "trialStartedAt" TIMESTAMP(3),
  "trialEndsAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OwnerBillingAccount_trial_dates_check" CHECK (
    ("status" = 'GRANDFATHERED' AND "trialStartedAt" IS NULL AND "trialEndsAt" IS NULL)
    OR ("status" IN ('TRIALING', 'EXPIRED') AND "trialStartedAt" IS NOT NULL AND "trialEndsAt" IS NOT NULL AND "trialEndsAt" = "trialStartedAt" + interval '336 hours')
  )
);
CREATE TABLE "OwnerBillingCoverage" (
  "id" SERIAL PRIMARY KEY,
  "accountId" INTEGER NOT NULL REFERENCES "OwnerBillingAccount"("id") ON DELETE RESTRICT,
  "companyId" INTEGER NOT NULL UNIQUE REFERENCES "Company"("id") ON DELETE RESTRICT,
  "covered" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "OwnerBillingCoverage_accountId_idx" ON "OwnerBillingCoverage"("accountId");
ALTER TABLE "OwnerBillingAccount" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "OwnerBillingCoverage" ENABLE ROW LEVEL SECURITY;

LOCK TABLE public."Company", public."UserCompany" IN SHARE ROW EXCLUSIVE MODE;

DO $block$
BEGIN
  IF EXISTS (SELECT 1 FROM public."Company" WHERE "createdById" IS NULL) THEN
    RAISE EXCEPTION 'No se puede migrar billing: hay hoteles sin propietario';
  END IF;
END;
$block$;

INSERT INTO public."OwnerBillingAccount" ("ownerId", status, "trialStartedAt", "trialEndsAt")
SELECT owners."ownerId",
       CASE WHEN trial."trialStartedAt" IS NULL THEN 'GRANDFATHERED'::public."BillingSubscriptionStatus" ELSE trial.status END,
       trial."trialStartedAt", trial."trialEndsAt"
FROM (SELECT DISTINCT "createdById" AS "ownerId" FROM public."Company") owners
LEFT JOIN LATERAL (
  SELECT s.status, s."trialStartedAt", s."trialEndsAt"
  FROM public."Company" c
  JOIN public."BillingAccount" a ON a."companyId" = c.id
  JOIN public."BillingSubscription" s ON s."accountId" = a.id
  WHERE c."createdById" = owners."ownerId" AND s."trialStartedAt" IS NOT NULL
  ORDER BY s."trialStartedAt", c.id LIMIT 1
) trial ON true;

INSERT INTO public."OwnerBillingCoverage" ("accountId", "companyId", covered)
SELECT a.id, c.id, true
FROM public."Company" c JOIN public."OwnerBillingAccount" a ON a."ownerId" = c."createdById";

DROP TRIGGER company_billing_after_insert ON public."Company";

CREATE FUNCTION public.owner_billing_on_membership() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $fn$
DECLARE
  v_account integer;
  v_status public."BillingSubscriptionStatus";
  v_now timestamp(3) := CURRENT_TIMESTAMP AT TIME ZONE 'UTC';
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public."UserType" WHERE id = NEW."typeId" AND role = 'OWNER') THEN
    RETURN NEW;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public."Company" WHERE id = NEW."companyId" AND ("createdById" = NEW."userId" OR "createdById" IS NULL)) THEN
    RETURN NEW;
  END IF;
  INSERT INTO public."OwnerBillingAccount" ("ownerId", status, "trialStartedAt", "trialEndsAt")
    VALUES (NEW."userId", 'TRIALING', v_now, v_now + interval '336 hours')
    ON CONFLICT ("ownerId") DO NOTHING;
  SELECT id, status INTO STRICT v_account, v_status FROM public."OwnerBillingAccount" WHERE "ownerId" = NEW."userId" FOR UPDATE;
  INSERT INTO public."OwnerBillingCoverage" ("accountId", "companyId", covered)
    VALUES (v_account, NEW."companyId", v_status <> 'GRANDFATHERED' AND (SELECT count(*) < 3 FROM public."OwnerBillingCoverage" WHERE "accountId" = v_account AND covered))
    ON CONFLICT ("companyId") DO NOTHING;
  RETURN NEW;
END;
$fn$;

CREATE TRIGGER owner_billing_after_membership AFTER INSERT ON public."UserCompany"
FOR EACH ROW EXECUTE FUNCTION public.owner_billing_on_membership();

COMMIT;
