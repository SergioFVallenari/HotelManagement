-- Realtime por postgres_changes: las tablas nuevas no entran solas a la
-- publicación, y los guards evitan fallar si ya se agregaron a mano.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'ChannelMessage'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE "ChannelMessage";
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'ChannelConversation'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE "ChannelConversation";
  END IF;
END $$;

-- Autorización de postgres_changes: se evalúa contra el JWT de cada suscriptor
-- (el backend firma company_id). Sin claims (migraciones/psql) es NULL → deny.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'ChannelMessage' AND policyname = 'company members read own messages'
  ) THEN
    CREATE POLICY "company members read own messages"
      ON "ChannelMessage" FOR SELECT TO authenticated
      USING ((current_setting('request.jwt.claims', true)::json ->> 'company_id')::int = "companyId");
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'ChannelConversation' AND policyname = 'company members read own conversations'
  ) THEN
    CREATE POLICY "company members read own conversations"
      ON "ChannelConversation" FOR SELECT TO authenticated
      USING ((current_setting('request.jwt.claims', true)::json ->> 'company_id')::int = "companyId");
  END IF;
END $$;
