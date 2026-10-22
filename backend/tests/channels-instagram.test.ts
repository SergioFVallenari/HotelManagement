import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { describe, it } from 'node:test';
import {
  computeSignature,
  mapAttachmentType,
  parseInstagramEvents,
  signatureMatches,
} from '../src/modules/channels/adapters/instagram.payload.js';

const ACCOUNT_ID = '17841400000000000';
const IGSID = '1234567890';

function webhook(messaging: unknown): unknown {
  return { object: 'instagram', entry: [{ id: ACCOUNT_ID, time: 1700000000, messaging }] };
}

describe('parseInstagramEvents', () => {
  it('normaliza un mensaje entrante de texto', () => {
    const events = parseInstagramEvents(
      webhook([
        {
          sender: { id: IGSID },
          recipient: { id: ACCOUNT_ID },
          timestamp: 1700000001000,
          message: { mid: 'mid-1', text: 'Hola, hay disponibilidad?' },
        },
      ]),
    );

    assert.equal(events.length, 1);
    const event = events[0];
    assert.equal(event.kind, 'message');
    if (event.kind !== 'message') return;
    assert.equal(event.direction, 'IN');
    assert.equal(event.participantId, IGSID);
    assert.equal(event.externalThreadId, IGSID);
    assert.equal(event.externalMessageId, 'mid-1');
    assert.equal(event.contentType, 'TEXT');
    assert.equal(event.text, 'Hola, hay disponibilidad?');
    assert.equal(event.sentAt.getTime(), 1700000001000);
  });

  it('marca los echo como salientes y usa el recipient como contraparte', () => {
    const events = parseInstagramEvents(
      webhook([
        {
          sender: { id: ACCOUNT_ID },
          recipient: { id: IGSID },
          timestamp: 1700000002000,
          message: { mid: 'mid-2', text: 'Sí, tenemos', is_echo: true },
        },
      ]),
    );

    assert.equal(events.length, 1);
    const event = events[0];
    assert.equal(event.kind, 'message');
    if (event.kind !== 'message') return;
    assert.equal(event.direction, 'OUT');
    assert.equal(event.participantId, IGSID);
  });

  it('interpreta los eventos read como marcado de leído', () => {
    const events = parseInstagramEvents(
      webhook([{ sender: { id: IGSID }, recipient: { id: ACCOUNT_ID }, timestamp: 1700000003000, read: { mid: 'mid-1' } }]),
    );

    assert.equal(events.length, 1);
    assert.equal(events[0].kind, 'read');
  });

  it('traduce adjuntos de imagen', () => {
    const events = parseInstagramEvents(
      webhook([
        {
          sender: { id: IGSID },
          recipient: { id: ACCOUNT_ID },
          timestamp: 1700000004000,
          message: {
            mid: 'mid-4',
            attachments: [{ type: 'image', payload: { url: 'https://cdn.example/a.jpg' } }],
          },
        },
      ]),
    );

    const event = events[0];
    assert.equal(event.kind, 'message');
    if (event.kind !== 'message') return;
    assert.equal(event.contentType, 'IMAGE');
    assert.equal(event.text, null);
    assert.equal(event.attachments?.[0].url, 'https://cdn.example/a.jpg');
  });

  it('ignora mensajes sin mid y payloads ajenos a instagram', () => {
    assert.equal(
      parseInstagramEvents(webhook([{ sender: { id: IGSID }, message: { text: 'sin mid' } }])).length,
      0,
    );
    assert.equal(parseInstagramEvents({ object: 'page', entry: [{ id: ACCOUNT_ID, messaging: [] }] }).length, 0);
    assert.equal(parseInstagramEvents(null).length, 0);
  });
});

describe('mapAttachmentType', () => {
  it('mapea los tipos conocidos y cae en FILE', () => {
    assert.equal(mapAttachmentType('image'), 'IMAGE');
    assert.equal(mapAttachmentType('video'), 'VIDEO');
    assert.equal(mapAttachmentType('ig_reel'), 'VIDEO');
    assert.equal(mapAttachmentType('audio'), 'AUDIO');
    assert.equal(mapAttachmentType('story_mention'), 'STORY');
    assert.equal(mapAttachmentType('share'), 'SHARE');
    assert.equal(mapAttachmentType('desconocido'), 'FILE');
    assert.equal(mapAttachmentType(undefined), 'FILE');
  });
});

describe('firma del webhook', () => {
  const secret = 'app-secret';
  const body = Buffer.from(JSON.stringify({ object: 'instagram' }));

  it('acepta una firma sha256 correcta', () => {
    const header = `sha256=${computeSignature(body, secret)}`;
    assert.equal(signatureMatches(body, header, secret), true);
  });

  it('rechaza firma incorrecta, formato inválido o secreto ausente', () => {
    assert.equal(signatureMatches(body, 'sha256=deadbeef', secret), false);
    assert.equal(signatureMatches(body, 'sha1=abcd', secret), false);
    assert.equal(signatureMatches(body, undefined, secret), false);
    assert.equal(signatureMatches(body, `sha256=${computeSignature(body, secret)}`, ''), false);
  });

  it('calcula el HMAC-SHA256 del cuerpo crudo', () => {
    const expected = crypto.createHmac('sha256', secret).update(body).digest('hex');
    assert.equal(computeSignature(body, secret), expected);
  });
});
