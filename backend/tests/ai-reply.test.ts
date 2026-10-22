import test from 'node:test';
import assert from 'node:assert/strict';
import { parseAiReply } from '../src/modules/ai/ai.reply.js';

test('parseAiReply entiende JSON válido', () => {
  const parsed = parseAiReply('{"action": "auto", "reply": "¡Hola! Sí, tenemos lugar."}');

  assert.deepEqual(parsed, { action: 'auto', reply: '¡Hola! Sí, tenemos lugar.' });
});

test('parseAiReply tolera fences de markdown', () => {
  const parsed = parseAiReply('```json\n{"action": "suggest", "reply": "Revisá esto"}\n```');

  assert.deepEqual(parsed, { action: 'suggest', reply: 'Revisá esto' });
});

test('parseAiReply extrae el JSON embebido en texto', () => {
  const parsed = parseAiReply('Acá va: {"action": "auto", "reply": "Listo"} espero que sirva');

  assert.deepEqual(parsed, { action: 'auto', reply: 'Listo' });
});

test('parseAiReply con acción desconocida cae en suggest', () => {
  const parsed = parseAiReply('{"action": "delete_everything", "reply": "x"}');

  assert.deepEqual(parsed, { action: 'suggest', reply: 'x' });
});

test('parseAiReply con JSON inválido cae en suggest con el texto crudo', () => {
  const parsed = parseAiReply('no soy json, contestá con esto');

  assert.deepEqual(parsed, { action: 'suggest', reply: 'no soy json, contestá con esto' });
});

test('parseAiReply con JSON sin reply cae en suggest', () => {
  const parsed = parseAiReply('{"action": "auto"}');

  assert.deepEqual(parsed, { action: 'suggest', reply: '{"action": "auto"}' });
});

test('parseAiReply trunca el reply a 1000 caracteres', () => {
  const long = 'a'.repeat(1500);
  const parsed = parseAiReply(JSON.stringify({ action: 'auto', reply: long }));

  assert.equal(parsed.reply.length, 1000);
});

test('parseAiReply con string vacío cae en suggest con texto vacío', () => {
  const parsed = parseAiReply('');

  assert.deepEqual(parsed, { action: 'suggest', reply: '' });
});
