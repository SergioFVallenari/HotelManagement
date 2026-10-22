-- GRANT: Realtime evalúa las policies SELECT de postgres_changes como rol
-- `authenticated` contra las tablas de public. Sin USAGE en el esquema la
-- evaluación falla con 42501 y Realtime descarta los eventos en silencio
-- (el join del canal privado no se entera: realtime.messages vive en otro
-- esquema). El proyecto no tiene los default grants de Supabase.
-- GRANT es repetible → idempotente.
GRANT USAGE ON SCHEMA public TO anon;
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT USAGE ON SCHEMA public TO service_role;
