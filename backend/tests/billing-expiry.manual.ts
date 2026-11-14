import 'dotenv/config';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';

async function main(): Promise<void> {
  const database = new URL(process.env.DATABASE_URL!);
  if (database.username !== 'postgres.sowbuvdeampxsbpgtgvo' || new URL(process.env.SUPABASE_URL!).hostname !== 'sowbuvdeampxsbpgtgvo.supabase.co') throw new Error('Destino de testing inválido');
  process.env.BILLING_ENFORCEMENT_TESTING = 'true';
  process.env.BILLING_LIMITS_TESTING = 'false';
  process.env.GEMINI_API_KEY = 'prueba-local';
  process.env.INSTAGRAM_MESSAGING_ENABLED = 'true';
  process.env.INBOX_AI_ENABLED = 'true';
  const { prisma } = await import('../src/config/prisma.js');
  const { createApp } = await import('../src/app.js');
  const { maybeAutoReply } = await import('../src/modules/ai/ai.service.js');
  const tag = `expiry-${randomUUID()}`;
  let ids: { user: number; company: number; conversation: string; token: string } | undefined;
  let server: ReturnType<ReturnType<typeof createApp>['listen']> | undefined;
  const originalFetch = globalThis.fetch;
  try {
    ids = await prisma.$transaction(async (tx) => {
      const ownerType = await tx.userType.findUniqueOrThrow({ where: { role: 'OWNER' } });
      const user = await tx.user.create({ data: { email: `${tag}@example.test` } });
      const company = await tx.company.create({ data: { name: tag, createdById: user.id } });
      await tx.userCompany.create({ data: { userId: user.id, companyId: company.id, username: tag, typeId: ownerType.id } });
      const type = await tx.roomType.create({ data: { name: tag, companyId: company.id } });
      const room = await tx.room.create({ data: { number: '1', typeId: type.id, companyId: company.id, price: 0, amenities: [] } });
      const token = randomUUID();
      await tx.bookingLink.create({ data: { token, companyId: company.id, roomId: room.id, checkIn: new Date('2030-01-01T00:00:00Z'), checkOut: new Date('2030-01-02T00:00:00Z'), total: 0, deposit: 0, expiresAt: new Date(Date.now() + 86_400_000) } });
      await tx.companyAiSetting.create({ data: { companyId: company.id, enabled: true, autoReply: true } });
      const channel = await tx.channelAccount.create({ data: { companyId: company.id, channel: 'INSTAGRAM', externalAccountId: tag, connectedAt: new Date(Date.now() - 60_000) } });
      const conversation = await tx.channelConversation.create({ data: { companyId: company.id, channel: 'INSTAGRAM', accountId: channel.id, externalThreadId: tag, participantId: tag, lastInboundAt: new Date() } });
      await tx.channelMessage.create({ data: { companyId: company.id, conversationId: conversation.id, externalMessageId: tag, direction: 'IN', text: 'Hola', sentAt: new Date() } });
      return { user: user.id, company: company.id, conversation: conversation.id, token };
    });
    server = createApp().listen(0, '127.0.0.1');
    await once(server, 'listening');
    const address = server.address();
    assert.ok(address && typeof address !== 'string');
    const base = `http://127.0.0.1:${address.port}/api/public/booking/${ids.token}`;
    let providerCalls = 0;
    globalThis.fetch = async (input, init) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      if (url.startsWith('http://127.0.0.1:')) return originalFetch(input, init);
      providerCalls++;
      return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify({ action: 'suggest', reply: 'Borrador de prueba' }) }] } }] }), { status: 200 });
    };
    await maybeAutoReply(ids.conversation);
    assert.equal(providerCalls, 1, 'La prueba de control debe alcanzar el proveedor simulado');
    const now = Date.now();
    await prisma.ownerBillingAccount.update({ where: { ownerId: ids.user }, data: { trialStartedAt: new Date(now - 15 * 86_400_000), trialEndsAt: new Date(now - 86_400_000) } });
    const quote = await fetch(base);
    assert.equal(quote.status, 200);
    const receipt = await fetch(`${base}/receipt`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ fileName: 'test.pdf', mimeType: 'application/pdf', size: 100 }) });
    assert.equal(receipt.status, 403);
    assert.equal(((await receipt.json()) as { error: { code: string } }).error.code, 'SUBSCRIPTION_EXPIRED');
    const booking = await fetch(base, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ firstName: 'Prueba', lastName: 'Prueba', phone: '123456' }) });
    assert.equal(booking.status, 403);
    assert.equal(((await booking.json()) as { error: { code: string } }).error.code, 'SUBSCRIPTION_EXPIRED');
    await maybeAutoReply(ids.conversation);
    assert.equal(providerCalls, 1, 'La cuenta vencida no debe llamar al proveedor');
    assert.equal(await prisma.reservation.count({ where: { companyId: ids.company } }), 0);
    console.log('Consulta pública permitida; comprobante, reserva y respuesta automática bloqueados.');
  } finally {
    globalThis.fetch = originalFetch;
    if (server) await new Promise<void>((resolve, reject) => server!.close((error) => error ? reject(error) : resolve()));
    if (ids) await prisma.$transaction(async (tx) => {
      await tx.channelMessage.deleteMany({ where: { companyId: ids!.company } });
      await tx.channelConversation.deleteMany({ where: { companyId: ids!.company } });
      await tx.channelAccount.deleteMany({ where: { companyId: ids!.company } });
      await tx.companyAiSetting.deleteMany({ where: { companyId: ids!.company } });
      await tx.bookingLink.deleteMany({ where: { companyId: ids!.company } });
      await tx.room.deleteMany({ where: { companyId: ids!.company } });
      await tx.roomType.deleteMany({ where: { companyId: ids!.company } });
      await tx.userCompany.deleteMany({ where: { companyId: ids!.company } });
      await tx.ownerBillingCoverage.deleteMany({ where: { companyId: ids!.company } });
      await tx.ownerBillingAccount.deleteMany({ where: { ownerId: ids!.user } });
      await tx.company.delete({ where: { id: ids!.company } });
      await tx.user.delete({ where: { id: ids!.user } });
    });
    await prisma.$disconnect();
  }
}

main().catch((err: unknown) => { console.error('[billing] Prueba de vencimiento falló', err instanceof Error ? err.message : err); process.exitCode = 1; });
