BEGIN;

CREATE TYPE "BillingSubscriptionStatus" AS ENUM ('TRIALING', 'GRANDFATHERED', 'EXPIRED');

CREATE TABLE "BillingAccount" (
  "id" SERIAL PRIMARY KEY,
  "companyId" INTEGER NOT NULL UNIQUE REFERENCES "Company"("id") ON DELETE RESTRICT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE "BillingProduct" (
  "id" SERIAL PRIMARY KEY,
  "code" TEXT NOT NULL UNIQUE,
  "name" TEXT NOT NULL
);
CREATE TABLE "BillingSubscription" (
  "id" SERIAL PRIMARY KEY,
  "accountId" INTEGER NOT NULL UNIQUE REFERENCES "BillingAccount"("id") ON DELETE RESTRICT,
  "status" "BillingSubscriptionStatus" NOT NULL,
  "trialStartedAt" TIMESTAMP(3),
  "trialEndsAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BillingSubscription_trial_dates_check" CHECK (
    ("status" = 'GRANDFATHERED' AND "trialStartedAt" IS NULL AND "trialEndsAt" IS NULL)
    OR ("status" IN ('TRIALING', 'EXPIRED') AND "trialStartedAt" IS NOT NULL AND "trialEndsAt" IS NOT NULL AND "trialEndsAt" = "trialStartedAt" + interval '336 hours')
  )
);
CREATE TABLE "BillingSubscriptionItem" (
  "id" SERIAL PRIMARY KEY,
  "subscriptionId" INTEGER NOT NULL UNIQUE REFERENCES "BillingSubscription"("id") ON DELETE RESTRICT,
  "productId" INTEGER NOT NULL REFERENCES "BillingProduct"("id") ON DELETE RESTRICT
);
CREATE TABLE "BillingSubscriptionEvent" (
  "id" SERIAL PRIMARY KEY,
  "subscriptionId" INTEGER NOT NULL REFERENCES "BillingSubscription"("id") ON DELETE RESTRICT,
  "type" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "BillingSubscriptionEvent_subscriptionId_createdAt_idx" ON "BillingSubscriptionEvent"("subscriptionId", "createdAt");

ALTER TABLE "BillingAccount" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "BillingProduct" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "BillingSubscription" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "BillingSubscriptionItem" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "BillingSubscriptionEvent" ENABLE ROW LEVEL SECURITY;

INSERT INTO "BillingProduct" ("code", "name") VALUES ('PRO', 'Pro');

CREATE FUNCTION public.provision_company_billing(p_company_id integer, p_grandfathered boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $fn$
DECLARE
  v_account integer;
  v_subscription integer;
  v_product integer;
  v_now timestamp(3) := CURRENT_TIMESTAMP AT TIME ZONE 'UTC';
BEGIN
  SELECT id INTO STRICT v_product FROM public."BillingProduct" WHERE code = 'PRO';
  INSERT INTO public."BillingAccount" ("companyId") VALUES (p_company_id)
    ON CONFLICT ("companyId") DO NOTHING;
  SELECT id INTO STRICT v_account FROM public."BillingAccount" WHERE "companyId" = p_company_id;
  INSERT INTO public."BillingSubscription" ("accountId", status, "trialStartedAt", "trialEndsAt")
    VALUES (v_account,
      CASE WHEN p_grandfathered THEN 'GRANDFATHERED'::public."BillingSubscriptionStatus" ELSE 'TRIALING'::public."BillingSubscriptionStatus" END,
      CASE WHEN p_grandfathered THEN NULL ELSE v_now END,
      CASE WHEN p_grandfathered THEN NULL ELSE v_now + interval '336 hours' END)
    ON CONFLICT ("accountId") DO NOTHING RETURNING id INTO v_subscription;
  IF v_subscription IS NOT NULL THEN
    INSERT INTO public."BillingSubscriptionItem" ("subscriptionId", "productId") VALUES (v_subscription, v_product);
    INSERT INTO public."BillingSubscriptionEvent" ("subscriptionId", type)
      VALUES (v_subscription, CASE WHEN p_grandfathered THEN 'grandfathered' ELSE 'trial_started' END);
  END IF;
END;
$fn$;

REVOKE ALL ON FUNCTION public.provision_company_billing(integer, boolean) FROM PUBLIC;

CREATE FUNCTION public.company_billing_on_insert() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $fn$
BEGIN
  PERFORM public.provision_company_billing(NEW.id, false);
  RETURN NEW;
END;
$fn$;

CREATE TRIGGER company_billing_after_insert AFTER INSERT ON public."Company"
FOR EACH ROW EXECUTE FUNCTION public.company_billing_on_insert();

SELECT public.provision_company_billing(id, true) FROM public."Company";

COMMIT;
