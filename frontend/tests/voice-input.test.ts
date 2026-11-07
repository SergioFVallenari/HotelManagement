import { test } from 'node:test';
import assert from 'node:assert/strict';
import { appendDictationText, createBrowserVoiceSession, createNativeVoiceSession, readSpeechResults, voiceErrorMessage, type BrowserSpeechRecognition, type SpeechResult } from '../src/lib/voiceInput.ts';

function harness() {
  const completed: string[] = [];
  const previews: string[] = [];
  const errors: string[] = [];
  const instances: FakeRecognition[] = [];
  class FakeRecognition implements BrowserSpeechRecognition {
    lang = '';
    continuous = false;
    interimResults = false;
    maxAlternatives = 0;
    onresult: BrowserSpeechRecognition['onresult'] = null;
    onerror: BrowserSpeechRecognition['onerror'] = null;
    onend: BrowserSpeechRecognition['onend'] = null;
    starts = 0;
    stops = 0;
    aborts = 0;
    constructor() { instances.push(this); }
    start() { this.starts++; }
    stop() { this.stops++; }
    abort() { this.aborts++; }
  }
  const callbacks = { onPreview: (text: string) => previews.push(text), onComplete: (text: string) => completed.push(text), onError: (message: string) => errors.push(message) };
  const session = createBrowserVoiceSession(FakeRecognition, callbacks);
  return { session, callbacks, completed, previews, errors, get recognition() { return instances[0]; } };
}

const result = (transcript: string, isFinal = true): SpeechResult => ({ 0: { transcript }, isFinal });

test('agrega el dictado al borrador sin reemplazarlo y respeta el límite del chat', () => {
  assert.deepEqual(appendDictationText('Reservame', ' del 2 al 5 '), { text: 'Reservame del 2 al 5', truncated: false });
  assert.equal(appendDictationText('Reservame\n', 'para Juan').text, 'Reservame\npara Juan');
  assert.equal(appendDictationText('', 'para Juan').text, 'para Juan');
  assert.equal(appendDictationText('Texto previo', '').text, 'Texto previo');
  const limited = appendDictationText('a'.repeat(5990), 'un pedido de reserva largo');
  assert.equal(limited.text.length, 6000);
  assert.equal(limited.truncated, true);
  assert.equal(appendDictationText('a'.repeat(6000), 'otro pedido').text, 'a'.repeat(6000));
});

test('separa resultados definitivos de los provisionales sin duplicar el historial de voz', () => {
  const results = [result('Reservame'), result('del dos', false)];
  assert.deepEqual(readSpeechResults(results), { confirmed: 'Reservame', preview: 'Reservame del dos' });
  assert.deepEqual(readSpeechResults([result(''), result('  ')]), { confirmed: '', preview: '' });
});

test('escucha solo al iniciar explícitamente, en español, y entrega texto una sola vez al terminar', () => {
  const h = harness();
  assert.equal(Boolean(h.recognition), false);
  h.session.start();
  assert.equal(h.recognition.lang, 'es-AR');
  assert.equal(h.recognition.interimResults, true);
  h.session.start();
  assert.equal(h.recognition.starts, 1);
  const onResult = h.recognition.onresult!;
  const onEnd = h.recognition.onend!;
  onResult({ results: [result('Reservame del 2 al 5'), result('para Juan', false)] });
  assert.deepEqual(h.completed, []);
  assert.equal(h.previews.at(-1), 'Reservame del 2 al 5 para Juan');
  onResult({ results: [result('Reservame del 2 al 5'), result('para Juan Pérez')] });
  onResult({ results: [result('Reservame del 2 al 5'), result('para Juan Pérez')] });
  h.session.stop();
  assert.equal(h.recognition.stops, 1);
  onEnd();
  onEnd();
  assert.deepEqual(h.completed, ['Reservame del 2 al 5 para Juan Pérez']);
  assert.equal(h.recognition.onresult, null);
  assert.equal(h.recognition.onerror, null);
  assert.equal(h.recognition.onend, null);
  assert.equal(h.recognition.aborts, 1);
});

test('cancelar libera el micrófono y descarta callbacks tardíos al cerrar el chat', () => {
  const h = harness();
  h.session.start();
  const onResult = h.recognition.onresult!;
  const onError = h.recognition.onerror!;
  const onEnd = h.recognition.onend!;
  h.session.cancel();
  h.session.cancel();
  onResult({ results: [result('No se debe agregar')] });
  onError({ error: 'aborted' });
  onEnd();
  assert.equal(h.recognition.aborts, 1);
  assert.deepEqual(h.previews, []);
  assert.deepEqual(h.completed, []);
  assert.deepEqual(h.errors, []);
});

test('permisos denegados no dejan el dictado bloqueado ni agregan texto', () => {
  const h = harness();
  h.session.start();
  h.recognition.onerror!({ error: 'not-allowed' });
  assert.match(h.errors[0], /permisos/);
  assert.deepEqual(h.completed, ['']);
  assert.equal(h.recognition.aborts, 1);
});

test('un error de red conserva el texto que ya fue reconocido definitivamente', () => {
  const h = harness();
  h.session.start();
  h.recognition.onresult!({ results: [result('Reservame una habitación'), result('para', false)] });
  h.recognition.onerror!({ error: 'network' });
  assert.deepEqual(h.completed, ['Reservame una habitación']);
  assert.match(h.errors[0], /conexión/);
});

test('no envía una hipótesis provisional si no hubo reconocimiento definitivo', () => {
  const h = harness();
  h.session.start();
  h.recognition.onresult!({ results: [result('fecha dudosa', false)] });
  h.recognition.onend!();
  assert.deepEqual(h.completed, ['']);
  assert.match(h.errors[0], /No se detectó voz/);
});

test('limita la escucha a 60 segundos y libera el micrófono si el navegador no termina', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const h = harness();
  h.session.start();
  t.mock.timers.tick(60_000);
  assert.equal(h.recognition.stops, 1);
  assert.deepEqual(h.completed, []);
  t.mock.timers.tick(5000);
  assert.equal(h.recognition.aborts, 1);
  assert.deepEqual(h.completed, ['']);
});

test('cancelar antes de iniciar no pide micrófono', () => {
  const h = harness();
  h.session.cancel();
  h.session.start();
  assert.equal(h.recognition, undefined);
  assert.deepEqual(h.completed, []);
});

test('un fallo síncrono de inicio se traduce y termina la sesión', () => {
  const h = harness();
  class BlockedRecognition {
    constructor() { throw new DOMException('Permission denied', 'NotAllowedError'); }
  }
  const session = createBrowserVoiceSession(BlockedRecognition as unknown as new () => BrowserSpeechRecognition, h.callbacks);
  session.start();
  assert.match(h.errors[0], /permisos/);
  assert.deepEqual(h.completed, ['']);
});

test('el dictado nativo no se ejecuta sin tocar iniciar y permite cancelar sin modificar el texto', async () => {
  const h = harness();
  let calls = 0;
  const session = createNativeVoiceSession(async () => { calls++; return { text: ' descartar ', cancelled: true }; }, h.callbacks);
  assert.equal(calls, 0);
  assert.equal(session.canStop, false);
  session.start();
  session.start();
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(calls, 1);
  assert.deepEqual(h.completed, ['']);
});

test('el dictado nativo devuelve texto revisable y no entrega resultados tras cerrar', async () => {
  const h = harness();
  let finish: (value: { text: string; cancelled: boolean }) => void;
  const session = createNativeVoiceSession(() => new Promise((resolve) => { finish = resolve; }), h.callbacks);
  session.start();
  await Promise.resolve();
  session.cancel();
  finish!({ text: 'Reservame para Juan', cancelled: false });
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.deepEqual(h.completed, []);
  const next = createNativeVoiceSession(async () => ({ text: ' Reservame para Juan ', cancelled: false }), h.callbacks);
  next.start();
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.deepEqual(h.completed, ['Reservame para Juan']);
});

test('cancelar inmediatamente un dictado nativo evita abrir el diálogo del sistema', async () => {
  const h = harness();
  let calls = 0;
  const session = createNativeVoiceSession(async () => { calls++; return { text: '', cancelled: true }; }, h.callbacks);
  session.start();
  session.cancel();
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(calls, 0);
  assert.deepEqual(h.completed, []);
});

test('un servicio nativo no disponible avisa y permite seguir escribiendo', async () => {
  const h = harness();
  const session = createNativeVoiceSession(async () => { throw { code: 'DICTADO_NO_DISPONIBLE' }; }, h.callbacks);
  session.start();
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.match(h.errors[0], /micrófono del teclado/);
  assert.deepEqual(h.completed, ['']);
});

test('mensajes de error en español sin filtrar detalles del proveedor', () => {
  assert.match(voiceErrorMessage('audio-capture'), /micrófono/);
  assert.match(voiceErrorMessage('language-not-supported'), /español/);
  assert.match(voiceErrorMessage('error-desconocido'), /texto anterior se conserva/);
});
