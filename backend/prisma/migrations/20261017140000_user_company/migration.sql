-- Refactor de identidad: "User" pasa a ser global (una fila por persona, con
-- email/authUserId unicos) y el vinculo con cada hotel vive en "UserCompany"
-- (username/typeId/isActive/createdById por membresia).
-- Se aplica sobre un esquema reseteado, sin backfill de datos.

-- CreateTable
CREATE TABLE "UserCompany" (
    "userId" INTEGER NOT NULL,
    "companyId" INTEGER NOT NULL,
    "username" TEXT NOT NULL,
    "typeId" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserCompany_pkey" PRIMARY KEY ("userId","companyId")
);

-- CreateIndex
CREATE UNIQUE INDEX "UserCompany_companyId_username_key" ON "UserCompany"("companyId", "username");
CREATE INDEX "UserCompany_companyId_idx" ON "UserCompany"("companyId");
CREATE INDEX "UserCompany_userId_idx" ON "UserCompany"("userId");
CREATE INDEX "UserCompany_typeId_idx" ON "UserCompany"("typeId");

-- AddForeignKey
ALTER TABLE "UserCompany" ADD CONSTRAINT "UserCompany_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserCompany" ADD CONSTRAINT "UserCompany_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "UserCompany" ADD CONSTRAINT "UserCompany_typeId_fkey" FOREIGN KEY ("typeId") REFERENCES "UserType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- DropIndex (los indices de los uniques viejos de User)
DROP INDEX IF EXISTS "User_companyId_username_key";
ALTER TABLE "User" DROP CONSTRAINT IF EXISTS "User_companyId_authUserId_key";
DROP INDEX IF EXISTS "User_companyId_idx";
DROP INDEX IF EXISTS "User_authUserId_idx";

-- AlterTable
ALTER TABLE "User" DROP COLUMN "username";
ALTER TABLE "User" DROP COLUMN "companyId";
ALTER TABLE "User" DROP COLUMN "typeId";
ALTER TABLE "User" DROP COLUMN "isActive";
ALTER TABLE "User" DROP COLUMN "idOwner";
ALTER TABLE "User" DROP COLUMN "createdById";

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE UNIQUE INDEX "User_authUserId_key" ON "User"("authUserId");

-- RLS deny-by-default, igual que el resto de las tablas de app.
ALTER TABLE "UserCompany" ENABLE ROW LEVEL SECURITY;

-- Sincronizacion auth.users -> public."User" + public."UserCompany".
--
-- Cambia respecto de 20261016140000_supabase_auth: "User" ahora es global y la
-- fila por hotel es la membresia. El upsert de User es por authUserId; la
-- idempotencia del alta interna se chequea sobre (authUserId, companyId) en
-- UserCompany porque el mismo auth user puede sumarse a varias empresas.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.schemata WHERE schema_name = 'auth'
  ) THEN
    RAISE NOTICE 'Schema "auth" ausente: se omite el trigger de sincronizacion';
  ELSE
    CREATE OR REPLACE FUNCTION public.sync_auth_user() RETURNS trigger
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = ''
    AS $fn$
    DECLARE
      v_meta     jsonb := COALESCE(NEW.raw_user_meta_data, '{}'::jsonb);
      v_username text;
      v_name     text;
      v_email    text;
      v_hotel    text;
      v_role     public."UserRole";
      v_active   boolean;
      v_type_id  integer;
      v_company  integer;
      v_user     integer;
    BEGIN
      v_username := nullif(btrim(v_meta ->> 'username'), '');
      v_name     := nullif(btrim(v_meta ->> 'name'), '');
      v_email    := nullif(btrim(NEW.email), '');
      v_active   := coalesce(nullif(v_meta ->> 'is_active', '')::boolean, true);

      IF v_username IS NULL OR v_email IS NULL THEN
        RAISE EXCEPTION 'metadata invalida: faltan username o email (auth %)', NEW.id;
      END IF;

      IF v_meta ->> 'company_id' IS NOT NULL THEN
        -- Alta interna: la empresa ya existe y la elige el backend.
        v_company := nullif(v_meta ->> 'company_id', '')::integer;

        -- Idempotencia sobre la membresia: el mismo auth user puede estar en
        -- varias empresas, asi que no alcanza con mirar public."User".
        IF EXISTS (
          SELECT 1
          FROM public."UserCompany" uc
          JOIN public."User" u ON u.id = uc."userId"
          WHERE u."authUserId" = NEW.id::text AND uc."companyId" = v_company
        ) THEN
          RETURN NULL;
        END IF;

        IF NOT EXISTS (SELECT 1 FROM public."Company" WHERE id = v_company) THEN
          RAISE EXCEPTION 'metadata invalida: company % inexistente', v_company;
        END IF;
        v_role := coalesce(nullif(v_meta ->> 'role', ''), 'RECEPCIONISTA')::public."UserRole";
      ELSE
        -- Self-service: crea el hotel y su OWNER. El rol nunca sale de la metadata
        -- para que quien se registre no pueda entrar en una empresa existente.
        IF EXISTS (SELECT 1 FROM public."User" WHERE "authUserId" = NEW.id::text) THEN
          RETURN NULL;
        END IF;

        v_hotel := nullif(btrim(v_meta ->> 'hotel_name'), '');
        IF v_hotel IS NULL THEN
          RAISE EXCEPTION 'metadata invalida: falta hotel_name (auth %)', NEW.id;
        END IF;

        v_role := 'OWNER';
        INSERT INTO public."Company" ("name", "updatedAt")
        VALUES (v_hotel, now())
        RETURNING id INTO v_company;
      END IF;

      -- "User" global: upsert por authUserId (email/name propios de la persona).
      INSERT INTO public."User" ("email", "name", "authUserId", "createdAt", "updatedAt")
      VALUES (v_email, v_name, NEW.id::text, now(), now())
      ON CONFLICT ("authUserId") DO UPDATE
        SET "email" = EXCLUDED."email",
            "name"  = COALESCE(EXCLUDED."name", public."User"."name"),
            "updatedAt" = now()
      RETURNING id INTO v_user;

      INSERT INTO public."UserType" ("role")
      VALUES (v_role)
      ON CONFLICT ("role") DO UPDATE SET "role" = EXCLUDED."role"
      RETURNING id INTO v_type_id;

      INSERT INTO public."UserCompany"
        ("userId", "companyId", "username", "typeId", "isActive", "createdById", "createdAt", "updatedAt")
      VALUES
        (v_user, v_company, v_username, v_type_id, v_active,
         nullif(v_meta ->> 'created_by_id', '')::integer, now(), now())
      ON CONFLICT ("userId", "companyId") DO NOTHING;

      -- El duenio self-service es el creador del hotel.
      IF v_meta ->> 'company_id' IS NULL THEN
        UPDATE public."Company" SET "createdById" = v_user, "updatedAt" = now() WHERE id = v_company;
      END IF;

      RETURN NULL;
    END;
    $fn$;

    DROP TRIGGER IF EXISTS on_auth_user_inserted ON auth.users;
    CREATE TRIGGER on_auth_user_inserted
      AFTER INSERT ON auth.users
      FOR EACH ROW
      WHEN (NEW.email_confirmed_at IS NOT NULL)
      EXECUTE FUNCTION public.sync_auth_user();

    DROP TRIGGER IF EXISTS on_auth_user_confirmed ON auth.users;
    CREATE TRIGGER on_auth_user_confirmed
      AFTER UPDATE ON auth.users
      FOR EACH ROW
      WHEN (OLD.email_confirmed_at IS NULL AND NEW.email_confirmed_at IS NOT NULL)
      EXECUTE FUNCTION public.sync_auth_user();
  END IF;
END $$;
