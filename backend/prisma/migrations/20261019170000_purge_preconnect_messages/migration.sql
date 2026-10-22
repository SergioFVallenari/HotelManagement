-- El hilo de la bandeja arranca desde el alta de la cuenta (connectedAt):
-- borra lo que se importó de Instagram antes de conectar y recalcula los
-- agregados de cada conversación. Idempotente (el DELETE borra 0 filas la
-- segunda vez y los UPDATE dejan de cambiar nada).
DELETE FROM "ChannelMessage" m
USING "ChannelConversation" c
JOIN "ChannelAccount" a ON a.id = c."accountId"
WHERE m."conversationId" = c.id
  AND m."sentAt" < a."connectedAt";

UPDATE "ChannelConversation" c
SET "lastMessageAt"      = sub.last_at,
    "lastMessagePreview" = sub.last_preview,
    "lastInboundAt"      = sub.last_in
FROM (
  SELECT m."conversationId",
         max(m."sentAt") AS last_at,
         (array_agg(COALESCE(m.text, '') ORDER BY m."sentAt" DESC, m.id DESC))[1] AS last_preview,
         max(m."sentAt") FILTER (WHERE m."direction" = 'IN') AS last_in
  FROM "ChannelMessage" m
  GROUP BY m."conversationId"
) sub
WHERE c.id = sub."conversationId";

UPDATE "ChannelConversation" c
SET "lastMessageAt" = NULL, "lastMessagePreview" = NULL, "lastInboundAt" = NULL
WHERE NOT EXISTS (SELECT 1 FROM "ChannelMessage" m WHERE m."conversationId" = c.id)
  AND (c."lastMessageAt" IS NOT NULL
    OR c."lastMessagePreview" IS NOT NULL
    OR c."lastInboundAt" IS NOT NULL);
