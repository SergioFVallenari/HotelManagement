import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildConversationsUrl,
  buildMessagesUrl,
  parseInstagramConversations,
  parseInstagramMessages,
  toIgDate,
} from '../src/modules/channels/adapters/instagram.conversations.js';

const ACCOUNT = '17841400000000000';
const USER = '1234567890';

const CONTEXT = {
  externalAccountId: ACCOUNT,
  businessId: ACCOUNT,
  businessHandle: 'hotel',
};

function conversation(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'conv-1',
    participants: {
      data: [
        { id: ACCOUNT, username: 'hotel' },
        { id: USER, username: 'juan', name: 'Juan' },
      ],
    },
    messages: {
      data: [
        {
          id: 'm-1',
          created_time: '2026-10-20T12:00:00+0000',
          from: { id: USER, username: 'juan', name: 'Juan' },
          to: { data: [{ id: ACCOUNT, username: 'hotel' }] },
          message: 'Hola, hay disponibilidad?',
        },
      ],
    },
    ...overrides,
  };
}

describe('toIgDate', () => {
  it('acepta ISO 8601', () => {
    assert.equal(toIgDate('2026-10-20T12:00:00+0000')?.toISOString(), '2026-10-20T12:00:00.000Z');
  });

  it('acepta segundos y milisegundos UNIX', () => {
    assert.equal(toIgDate(1_700_000_000)?.getTime(), 1_700_000_000_000);
    assert.equal(toIgDate(1_700_000_000_500)?.getTime(), 1_700_000_000_500);
  });

  it('devuelve null para valores inválidos', () => {
    assert.equal(toIgDate(null), null);
    assert.equal(toIgDate(''), null);
    assert.equal(toIgDate('no-es-fecha'), null);
    assert.equal(toIgDate(Number.NaN), null);
  });
});

describe('parseInstagramConversations', () => {
  it('normaliza una conversación con el último mensaje entrante', () => {
    const refs = parseInstagramConversations({ data: [conversation()] }, CONTEXT);
    assert.equal(refs.length, 1);

    const ref = refs[0];
    assert.equal(ref.externalConversationId, 'conv-1');
    assert.equal(ref.participantId, USER);
    assert.equal(ref.participant?.handle, 'juan');
    assert.equal(ref.participant?.name, 'Juan');
    assert.equal(ref.latestMessage?.externalThreadId, USER);
    assert.equal(ref.latestMessage?.externalConversationId, 'conv-1');
    assert.equal(ref.latestMessage?.direction, 'IN');
    assert.equal(ref.latestMessage?.externalMessageId, 'm-1');
    assert.equal(ref.latestMessage?.text, 'Hola, hay disponibilidad?');
    assert.equal(ref.latestMessage?.contentType, 'TEXT');
  });

  it('marca como saliente un mensaje del negocio', () => {
    const refs = parseInstagramConversations(
      {
        data: [
          conversation({
            messages: {
              data: [
                {
                  id: 'm-2',
                  created_time: '2026-10-20T13:00:00+0000',
                  from: { id: ACCOUNT, username: 'hotel' },
                  to: { data: [{ id: USER, username: 'juan' }] },
                  message: 'Sí, tenemos',
                },
              ],
            },
          }),
        ],
      },
      CONTEXT,
    );

    assert.equal(refs[0].latestMessage?.direction, 'OUT');
    assert.equal(refs[0].latestMessage?.participantId, USER);
    assert.equal(refs[0].latestMessage?.participant?.handle, 'juan');
  });

  it('reconoce al negocio por handle aunque el id no coincida', () => {
    const refs = parseInstagramConversations(
      {
        data: [
          {
            id: 'conv-2',
            participants: {
              data: [
                { id: 'message-scoped-business', username: 'hotel' },
                { id: USER, username: 'juan' },
              ],
            },
            messages: {
              data: [
                {
                  id: 'm-3',
                  created_time: '2026-10-20T13:00:00+0000',
                  from: { id: 'message-scoped-business', username: 'hotel' },
                  to: { data: [{ id: USER, username: 'juan' }] },
                  message: 'Hola',
                },
              ],
            },
          },
        ],
      },
      { ...CONTEXT, businessId: 'otro-id' },
    );

    assert.equal(refs[0].latestMessage?.direction, 'OUT');
    assert.equal(refs[0].participantId, USER);
  });

  it('mapea adjuntos y reply_to', () => {
    const refs = parseInstagramConversations(
      {
        data: [
          conversation({
            messages: {
              data: [
                {
                  id: 'm-4',
                  created_time: '2026-10-20T14:00:00+0000',
                  from: { id: USER, username: 'juan' },
                  to: { data: [{ id: ACCOUNT }] },
                  attachments: {
                    data: [
                      { image_data: { url: 'https://cdn.test/foto.jpg', preview_url: 'https://cdn.test/foto-preview.jpg' } },
                      { share: { link: 'https://instagram.com/p/abc' } },
                    ],
                  },
                  reply_to: { mid: 'm-1' },
                },
              ],
            },
          }),
        ],
      },
      CONTEXT,
    );

    const message = refs[0].latestMessage;
    assert.equal(message?.contentType, 'IMAGE');
    assert.equal(message?.text, null);
    assert.equal(message?.replyToExternalId, 'm-1');
    assert.deepEqual(message?.attachments, [
      { type: 'IMAGE', url: 'https://cdn.test/foto.jpg', name: undefined, mimeType: undefined },
      { type: 'SHARE', url: 'https://instagram.com/p/abc', name: undefined, mimeType: undefined },
    ]);
  });

  it('usa los participantes cuando el último mensaje no vino expandido', () => {
    const refs = parseInstagramConversations(
      {
        data: [
          {
            id: 'conv-3',
            participants: { data: [{ id: USER, username: 'juan' }] },
          },
        ],
      },
      CONTEXT,
    );

    assert.equal(refs.length, 1);
    assert.equal(refs[0].participantId, USER);
    assert.equal(refs[0].participant?.handle, 'juan');
    assert.equal(refs[0].latestMessage, null);
  });

  it('infiere el participante desde el último mensaje si no hay participants', () => {
    const refs = parseInstagramConversations(
      {
        data: [
          {
            id: 'conv-4',
            messages: {
              data: [
                {
                  id: 'm-5',
                  created_time: '2026-10-20T15:00:00+0000',
                  from: { id: USER, username: 'juan' },
                  to: { data: [{ id: ACCOUNT }] },
                  message: 'Hola',
                },
              ],
            },
          },
        ],
      },
      CONTEXT,
    );

    assert.equal(refs[0].participantId, USER);
    assert.equal(refs[0].latestMessage?.direction, 'IN');
  });

  it('descarta payloads inválidos y conversaciones sin contraparte', () => {
    assert.deepEqual(parseInstagramConversations(null, CONTEXT), []);
    assert.deepEqual(
      parseInstagramConversations(
        { data: [{ id: 'conv-x', participants: { data: [{ id: ACCOUNT, username: 'hotel' }] } }] },
        CONTEXT,
      ),
      [],
    );
    assert.deepEqual(parseInstagramConversations({ data: [{ messages: { data: [] } }] }, CONTEXT), []);
  });
});

describe('parseInstagramMessages', () => {
  it('ordena cronológicamente y respeta el thread de la conversación', () => {
    const events = parseInstagramMessages(
      {
        data: [
          {
            id: 'm-2',
            created_time: '2026-10-20T13:00:00+0000',
            from: { id: USER, username: 'juan' },
            to: { data: [{ id: ACCOUNT }] },
            message: 'dos',
          },
          {
            id: 'm-1',
            created_time: '2026-10-20T12:00:00+0000',
            from: { id: ACCOUNT, username: 'hotel' },
            to: { data: [{ id: USER }] },
            message: 'uno',
          },
        ],
      },
      {
        ...CONTEXT,
        externalConversationId: 'conv-1',
        threadId: USER,
        participant: { handle: 'juan' },
      },
    );

    assert.deepEqual(events.map((event) => event.externalMessageId), ['m-1', 'm-2']);
    assert.equal(events[0].direction, 'OUT');
    assert.equal(events[1].direction, 'IN');
    assert.equal(events[0].externalThreadId, USER);
    assert.equal(events[0].participant?.handle, 'juan');
  });

  it('descarta mensajes sin id o con fecha inválida', () => {
    const events = parseInstagramMessages(
      {
        data: [
          { id: 'm-1', created_time: 'no-es-fecha', from: { id: USER } },
          { created_time: '2026-10-20T12:00:00+0000', from: { id: USER } },
        ],
      },
      { ...CONTEXT, externalConversationId: 'conv-1', threadId: USER },
    );

    assert.deepEqual(events, []);
  });
});

describe('URLs de la Conversations API', () => {
  it('construye la URL de conversaciones', () => {
    const url = new URL(buildConversationsUrl('https://graph.instagram.com/v23.0/', { limit: 50 }));
    assert.equal(url.pathname, '/v23.0/me/conversations');
    assert.equal(url.searchParams.get('platform'), 'instagram');
    assert.equal(url.searchParams.get('limit'), '50');
    assert.match(url.searchParams.get('fields') ?? '', /messages\.limit\(1\)/);
  });

  it('agrega user_id al resolver una conversación', () => {
    const url = new URL(
      buildConversationsUrl('https://graph.instagram.com/v23.0', { limit: 1, userId: USER }),
    );
    assert.equal(url.searchParams.get('user_id'), USER);
    assert.equal(url.searchParams.get('limit'), '1');
  });

  it('construye la URL de mensajes', () => {
    const url = new URL(buildMessagesUrl('https://graph.instagram.com/v23.0/', 'conv_1', 20));
    assert.equal(url.pathname, '/v23.0/conv_1/messages');
    assert.equal(url.searchParams.get('limit'), '20');
    assert.match(url.searchParams.get('fields') ?? '', /created_time/);
  });
});
