import { Capacitor, registerPlugin } from '@capacitor/core';
import type { SpeechRecognitionConstructor } from '../lib/voiceInput';

interface NativeVoiceInput {
  start(): Promise<{ text: string; cancelled: boolean }>;
}

export const nativeVoiceInput = registerPlugin<NativeVoiceInput>('VoiceInput');

export function voiceInputSupport(): { native: boolean; recognition: SpeechRecognitionConstructor | null; reason: string | null } {
  if (Capacitor.getPlatform() === 'android') {
    return { native: true, recognition: null, reason: Capacitor.isPluginAvailable('VoiceInput') ? null : 'Actualizá la app para usar el dictado. También podés usar el micrófono del teclado.' };
  }
  if (typeof window === 'undefined' || !window.isSecureContext) {
    return { native: false, recognition: null, reason: 'El dictado requiere HTTPS o localhost. Podés escribir o usar el micrófono del teclado.' };
  }
  const browser = window as Window & { SpeechRecognition?: SpeechRecognitionConstructor; webkitSpeechRecognition?: SpeechRecognitionConstructor };
  const recognition = browser.SpeechRecognition ?? browser.webkitSpeechRecognition ?? null;
  return { native: false, recognition, reason: recognition ? null : 'Este navegador no ofrece dictado. Probá con Chrome o usá el micrófono del teclado.' };
}
