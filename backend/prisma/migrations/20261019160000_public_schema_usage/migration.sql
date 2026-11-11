-- GRANT: Realtime evalúa las policies SELECT de postgres_changes como rol
-- `authenticated` contra las tablas de public. Sin USAGE en el esquema la
-- evaluación falla con 42501 y Realtime descarta los eventos en silencio
-- (el join del canal privado no se entera: realtime.messages vive en otro
-- esquema). El proyecto no tiene los default grants de Supabase.
-- GRANT es repetible → idempotente.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    GRANT USAGE ON SCHEMA public TO anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    GRANT USAGE ON SCHEMA public TO authenticated;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT USAGE ON SCHEMA public TO service_role;
  END IF;
END $$;
