-- Supabase Auth pasa a ser el store de credenciales:
--   * authUserId vincula la fila de app con auth.users.id. Un auth user puede tener
--     varias filas de app (una por empresa): asi se mantiene el multi-empresa actual.
--   * passwordHash se elimina: el hash vive en auth.users.encrypted_password.
--   * email pasa a NOT NULL porque la identidad de login es el email.
--   * EmailVerificationCode se elimina: la confirmacion de email la hace Supabase.

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "authUserId" TEXT;

-- CreateIndex
CREATE INDEX "User_authUserId_idx" ON "User"("authUserId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'User_companyId_authUserId_key'
  ) THEN
    ALTER TABLE "User" ADD CONSTRAINT "User_companyId_authUserId_key" UNIQUE ("companyId", "authUserId");
  END IF;
END $$;

-- AlterTable
ALTER TABLE "User" ALTER COLUMN "email" SET NOT NULL;

-- AlterTable
ALTER TABLE "User" DROP COLUMN     "passwordHash";

-- DropTable
DROP TABLE "EmailVerificationCode";

-- Sincronizacion auth.users -> public."User".
--
-- SECURITY DEFINER con search_path='' y duenio postgres: GoTrue inserta en auth.users
-- como "supabase_auth_admin", que no es duenio de las tablas de app y no podria
-- escribir con el RLS deny-by-default. Como duenio de las tablas (y sin FORCE RLS)
-- bypasea el RLS igual que el backend.
--
-- Dos triggers porque con "Confirm email" ON el alta real es la confirmacion: el
-- INSERT crea la fila solo si el email ya viene confirmado (admin.createUser con
-- email_confirm:true) y el UPDATE la crea cuando el usuario hace click en el link.
-- GoTrue toca last_sign_in_at en cada login, por eso el WHEN filtra solo la
-- transicion de no-confirmado a confirmado.
--
-- El guard de schema hace que la migracion no reviente en un Postgres sin el
-- schema "auth".
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
      -- Idempotencia: tanto el INSERT como el UPDATE del email confirmado pueden
      -- llegar a dejar la fila ya creada.
      IF EXISTS (SELECT 1 FROM public."User" WHERE "authUserId" = NEW.id::text) THEN
        RETURN NULL;
      END IF;

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
        v_role := coalesce(nullif(v_meta ->> 'role', ''), 'RECEPCIONISTA')::public."UserRole";

        IF NOT EXISTS (SELECT 1 FROM public."Company" WHERE id = v_company) THEN
          RAISE EXCEPTION 'metadata invalida: company % inexistente', v_company;
        END IF;

        INSERT INTO public."UserType" ("role")
        VALUES (v_role)
        ON CONFLICT ("role") DO UPDATE SET "role" = EXCLUDED."role"
        RETURNING id INTO v_type_id;

        INSERT INTO public."User"
          ("username", "name", "email", "typeId", "companyId", "createdById", "isActive", "authUserId", "updatedAt")
        VALUES
          (v_username, v_name, v_email, v_type_id, v_company,
           nullif(v_meta ->> 'created_by_id', '')::integer, v_active, NEW.id::text, now());
      ELSE
        -- Self-service: crea el hotel y su OWNER. El rol nunca sale de la metadata
        -- para que quien se registre no pueda entrar en una empresa existente.
        v_hotel := nullif(btrim(v_meta ->> 'hotel_name'), '');
        IF v_hotel IS NULL THEN
          RAISE EXCEPTION 'metadata invalida: falta hotel_name (auth %)', NEW.id;
        END IF;

        INSERT INTO public."Company" ("name", "updatedAt")
        VALUES (v_hotel, now())
        RETURNING id INTO v_company;

        INSERT INTO public."UserType" ("role")
        VALUES ('OWNER')
        ON CONFLICT ("role") DO UPDATE SET "role" = EXCLUDED."role"
        RETURNING id INTO v_type_id;

        INSERT INTO public."User"
          ("username", "name", "email", "typeId", "companyId", "createdById", "isActive", "authUserId", "updatedAt")
        VALUES (v_username, v_name, v_email, v_type_id, v_company, NULL, true, NEW.id::text, now())
        RETURNING id INTO v_user;

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
