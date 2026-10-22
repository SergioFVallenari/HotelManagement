import { env } from '../../config/env.js';
import { AppError } from '../../lib/AppError.js';
import type { AiTurn } from './ai.prompt.js';

const TIMEOUT_MS = 15_000;
const RETRYABLE = new Set([429, 503]);

const RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    action: { type: 'string', enum: ['auto', 'suggest'] },
    reply: { type: 'string' },
  },
  required: ['action', 'reply'],
} as const;

interface GeminiPart {
  text: string;
}

async function postOnce(url: string, body: unknown): Promise<{ ok: boolean; status: number; text: string }> {
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': env.ai.geminiApiKey,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const text = await res.text().catch(() => '');
  return { ok: res.ok, status: res.status, text };
}

// Devuelve el texto crudo de la respuesta (JSON con {action, reply}); el parse
// y los fallbacks viven en ai.reply.ts. Hasta 3 intentos con backoff corto
// ante 429/503: la free tier de Gemini tiene picos de demanda de segundos.
export async function generateJson(input: { systemInstruction: string; userTurns: AiTurn[] }): Promise<string> {
  if (!env.ai.geminiApiKey) {
    throw new AppError(503, 'AI_NOT_CONFIGURED', 'El asistente de IA no está configurado');
  }

  const url = `${env.ai.geminiApiUrl}/models/${env.ai.geminiModel}:generateContent`;
  const payload = {
    systemInstruction: { parts: [{ text: input.systemInstruction }] satisfies GeminiPart[] },
    contents: input.userTurns.map((turn) => ({
      role: turn.role === 'model' ? 'model' : 'user',
      parts: [{ text: turn.text }] satisfies GeminiPart[],
    })),
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: RESPONSE_SCHEMA,
    },
  };

  let lastError = '';
  for (let attempt = 0; attempt < 3; attempt += 1) {
    let result: { ok: boolean; status: number; text: string };
    try {
      result = await postOnce(url, payload);
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      continue;
    }
    if (result.ok) {
      let json: unknown;
      try {
        json = JSON.parse(result.text);
      } catch {
        throw new AppError(502, 'AI_BAD_RESPONSE', 'Gemini devolvió una respuesta ilegible');
      }
      const candidate = (json as { candidates?: Array<{ content?: { parts?: GeminiPart[] } }> })
        ?.candidates?.[0];
      const text = candidate?.content?.parts?.map((part) => part.text ?? '').join('').trim();
      if (!text) {
        throw new AppError(502, 'AI_BAD_RESPONSE', 'Gemini no devolvió contenido');
      }
      return text;
    }
    lastError = result.text.slice(0, 300);
    if (!RETRYABLE.has(result.status)) break;
    await new Promise((resolve) => setTimeout(resolve, 1500 * (attempt + 1)));
  }

  throw new AppError(502, 'AI_UPSTREAM_FAILED', 'No se pudo consultar al asistente de IA', {
    detail: lastError,
  });
}
