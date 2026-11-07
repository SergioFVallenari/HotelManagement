export interface SpeechResult {
  isFinal: boolean;
  0: { transcript: string };
}

export interface BrowserSpeechRecognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((event: { results: ArrayLike<SpeechResult> }) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

export type SpeechRecognitionConstructor = new () => BrowserSpeechRecognition;

interface VoiceCallbacks {
  onPreview(text: string): void;
  onComplete(text: string): void;
  onError(message: string): void;
}

export interface VoiceSession {
  canStop: boolean;
  start(): void;
  stop(): void;
  cancel(): void;
}

export function voiceErrorMessage(code: string): string {
  switch (code) {
    case 'not-allowed':
    case 'service-not-allowed':
    case 'NotAllowedError':
    case 'SecurityError':
      return 'No se permitió usar el micrófono. Revisá los permisos del navegador o del dispositivo y volvé a intentar.';
    case 'audio-capture':
    case 'NotFoundError':
      return 'No se encontró un micrófono disponible. Revisá que esté conectado y que otra aplicación no lo esté usando.';
    case 'no-speech':
      return 'No se detectó voz. Acercate al micrófono y volvé a intentar.';
    case 'network':
      return 'No se pudo conectar al servicio de dictado. Revisá tu conexión o escribí el pedido.';
    case 'language-not-supported':
      return 'El servicio de dictado no admite español en este dispositivo. Podés escribir o usar el micrófono del teclado.';
    case 'DICTADO_NO_DISPONIBLE':
    case 'UNIMPLEMENTED':
    case 'UNAVAILABLE':
      return 'El dictado no está disponible en este dispositivo. Podés escribir o usar el micrófono del teclado.';
    default:
      return 'No se pudo completar el dictado. El texto anterior se conserva; podés volver a intentar o escribir el pedido.';
  }
}

export function appendDictationText(draft: string, spoken: string, maxLength = 6000): { text: string; truncated: boolean } {
  const words = spoken.trim();
  if (!words) return { text: draft, truncated: false };
  const separator = draft && !/\s$/.test(draft) ? ' ' : '';
  const combined = `${draft}${separator}${words}`;
  return { text: combined.slice(0, maxLength), truncated: combined.length > maxLength };
}

export function readSpeechResults(results: ArrayLike<SpeechResult>): { confirmed: string; preview: string } {
  const confirmed: string[] = [];
  const preview: string[] = [];
  for (const result of Array.from(results)) {
    const text = result[0]?.transcript?.trim();
    if (!text) continue;
    preview.push(text);
    if (result.isFinal) confirmed.push(text);
  }
  return { confirmed: confirmed.join(' '), preview: preview.join(' ') };
}

export function createBrowserVoiceSession(Recognition: SpeechRecognitionConstructor, callbacks: VoiceCallbacks): VoiceSession {
  let recognition: BrowserSpeechRecognition | null = null;
  let confirmed = '';
  let started = false;
  let disposed = false;
  let stopping = false;
  let limitTimer: ReturnType<typeof setTimeout> | undefined;
  let stopTimer: ReturnType<typeof setTimeout> | undefined;

  function detach() {
    clearTimeout(limitTimer);
    clearTimeout(stopTimer);
    if (!recognition) return;
    recognition.onresult = null;
    recognition.onerror = null;
    recognition.onend = null;
  }

  function release() {
    detach();
    try { recognition?.abort(); } catch {}
  }

  function complete(error?: string) {
    if (disposed) return;
    disposed = true;
    release();
    if (error) callbacks.onError(error);
    callbacks.onComplete(confirmed);
  }

  function stop() {
    if (disposed || !recognition || stopping) return;
    stopping = true;
    stopTimer = setTimeout(() => complete(), 5000);
    try { recognition.stop(); } catch { complete(); }
  }

  return {
    canStop: true,
    start() {
      if (started || disposed) return;
      started = true;
      try {
        recognition = new Recognition();
        recognition.lang = 'es-AR';
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.maxAlternatives = 1;
        recognition.onresult = (event) => {
          if (disposed) return;
          const result = readSpeechResults(event.results);
          confirmed = result.confirmed;
          callbacks.onPreview(result.preview);
        };
        recognition.onerror = (event) => complete(voiceErrorMessage(event.error));
        recognition.onend = () => complete(!confirmed ? voiceErrorMessage('no-speech') : undefined);
        limitTimer = setTimeout(stop, 60_000);
        recognition.start();
      } catch (error) {
        complete(voiceErrorMessage(error instanceof Error ? error.name : ''));
      }
    },
    stop,
    cancel() {
      if (disposed) return;
      disposed = true;
      release();
    },
  };
}

export function createNativeVoiceSession(recognize: () => Promise<{ text: string; cancelled: boolean }>, callbacks: VoiceCallbacks): VoiceSession {
  let started = false;
  let disposed = false;
  return {
    canStop: false,
    start() {
      if (started || disposed) return;
      started = true;
      void Promise.resolve().then(() => disposed ? { text: '', cancelled: true } : recognize()).then((result) => {
        if (disposed) return;
        disposed = true;
        callbacks.onComplete(result.cancelled ? '' : result.text.trim());
      }).catch((error: unknown) => {
        if (disposed) return;
        disposed = true;
        const code = typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : '';
        callbacks.onError(voiceErrorMessage(code));
        callbacks.onComplete('');
      });
    },
    stop() {},
    cancel() { disposed = true; },
  };
}
