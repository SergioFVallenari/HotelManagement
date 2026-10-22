-- Sin SELECT privilege para `authenticated`, Realtime no puede materializar las
-- filas de postgres_changes: los payloads llegan vacíos, el filter no matchea y
-- la RLS no se evalúa bien. El proyecto no tiene default privileges de Supabase
-- en `public` (nada de las tablas de app está concedido a authenticated/anon),
-- y solo estas dos tablas las necesita Realtime. GRANT es idempotente.
GRANT SELECT ON "ChannelMessage" TO authenticated;
GRANT SELECT ON "ChannelConversation" TO authenticated;
