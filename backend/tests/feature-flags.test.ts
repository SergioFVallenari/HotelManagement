import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { NextFunction, Request, Response } from 'express';

process.env.INSTAGRAM_MESSAGING_ENABLED = 'false';
process.env.INBOX_AI_ENABLED = 'false';

test('Instagram y respuestas de IA se rechazan cuando están desactivados', async () => {
  const { requireInstagramMessaging, requireInboxAi } = await import('../src/middleware/featureFlags.js');
  const req = {} as Request;
  const res = {} as Response;
  let passed = false;
  const next: NextFunction = () => { passed = true; };
  assert.throws(() => requireInstagramMessaging(req, res, next), { code: 'INSTAGRAM_DISABLED', statusCode: 503 });
  assert.throws(() => requireInboxAi(req, res, next), { code: 'INBOX_AI_DISABLED', statusCode: 503 });
  assert.equal(passed, false);
});

test('la respuesta automática no consulta datos cuando ambas funciones están desactivadas', async () => {
  const { maybeAutoReply } = await import('../src/modules/ai/ai.service.js');
  await assert.doesNotReject(maybeAutoReply('conversacion-inexistente'));
  const { prisma } = await import('../src/config/prisma.js');
  await prisma.$disconnect();
});
