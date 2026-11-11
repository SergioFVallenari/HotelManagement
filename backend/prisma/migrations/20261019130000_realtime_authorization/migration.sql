-- Autorizacion de canales privados de Supabase Realtime.
-- El backend publica en el topic 'company:<id>' con la service role key (bypassa RLS);
-- el frontend se suscribe con un JWT firmado por el backend que lleva el claim
-- 'company_id'. Esta policy deja leer unicamente el topic de la propia empresa.
--
-- NO agregar ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY: la tabla ya
-- tiene RLS y el statement falla con 42501 (must be owner of table messages),
-- abortando toda la transaccion de la migracion.
DO $$
BEGIN
  IF to_regclass('realtime.messages') IS NULL THEN
    RAISE NOTICE 'Supabase Realtime ausente: se omite la policy de canales privados';
    RETURN;
  END IF;

  DROP POLICY IF EXISTS "company members can read own realtime topic"
  ON "realtime"."messages";
  CREATE POLICY "company members can read own realtime topic"
  ON "realtime"."messages"
  FOR SELECT
  TO authenticated
  USING (
    realtime.topic() = 'company:' || (current_setting('request.jwt.claims', true)::json ->> 'company_id')
  );
END $$;
