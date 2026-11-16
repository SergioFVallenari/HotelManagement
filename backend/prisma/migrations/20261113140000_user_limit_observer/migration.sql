BEGIN;

CREATE TABLE public."BillingLimitControl" (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  "userLimitEnabled" BOOLEAN NOT NULL DEFAULT false
);
INSERT INTO public."BillingLimitControl" (id) VALUES (1);
ALTER TABLE public."BillingLimitControl" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."BillingLimitControl" FROM PUBLIC;

CREATE FUNCTION public.check_active_user_limit() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $fn$
DECLARE
  v_status public."BillingSubscriptionStatus";
  v_count bigint;
BEGIN
  IF NOT (SELECT "userLimitEnabled" FROM public."BillingLimitControl" WHERE id = 1) THEN
    RETURN NEW;
  END IF;
  IF NOT NEW."isActive" THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' THEN
    IF OLD."isActive" AND OLD."companyId" = NEW."companyId" THEN RETURN NEW; END IF;
  END IF;

  PERFORM 1 FROM public."Company" WHERE id = NEW."companyId" FOR UPDATE;
  SELECT a.status INTO v_status
  FROM public."OwnerBillingCoverage" c JOIN public."OwnerBillingAccount" a ON a.id = c."accountId"
  WHERE c."companyId" = NEW."companyId";

  IF v_status IS NULL THEN
    IF EXISTS (SELECT 1 FROM public."UserType" WHERE id = NEW."typeId" AND role = 'OWNER')
       AND NOT EXISTS (SELECT 1 FROM public."UserCompany" WHERE "companyId" = NEW."companyId") THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'BILLING_INCOMPLETE';
  END IF;
  IF v_status = 'GRANDFATHERED' THEN RETURN NEW; END IF;
  SELECT count(*) INTO v_count FROM public."UserCompany" WHERE "companyId" = NEW."companyId" AND "isActive";
  IF v_count >= 3 THEN RAISE EXCEPTION 'USER_LIMIT_REACHED'; END IF;
  RETURN NEW;
END;
$fn$;

CREATE TRIGGER billing_user_limit_before_insert
BEFORE INSERT ON public."UserCompany" FOR EACH ROW EXECUTE FUNCTION public.check_active_user_limit();
CREATE TRIGGER billing_user_limit_before_update
BEFORE UPDATE OF "isActive", "companyId" ON public."UserCompany" FOR EACH ROW EXECUTE FUNCTION public.check_active_user_limit();

COMMIT;
