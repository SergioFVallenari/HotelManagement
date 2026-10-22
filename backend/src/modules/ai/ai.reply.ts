export interface AiReply {
  action: 'auto' | 'suggest';
  reply: string;
}

const MAX_REPLY_CHARS = 1000;

function sanitize(reply: unknown): string {
  if (typeof reply !== 'string') return '';
  return reply.trim().slice(0, MAX_REPLY_CHARS);
}

function tryParse(raw: string): AiReply | null {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    const record = parsed as Record<string, unknown>;
    const reply = sanitize(record.reply);
    if (!reply) return null;
    const action = record.action === 'auto' || record.action === 'suggest' ? record.action : 'suggest';
    return { action, reply };
  } catch {
    return null;
  }
}

function stripFences(raw: string): string {
  const trimmed = raw.trim();
  const fence = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(trimmed);
  return fence ? fence[1] : trimmed;
}

// Cualquier respuesta ilegible cae en suggest (nunca auto): el peor caso es un
// borrador que el empleado edita a mano, jamás un auto-envío basura.
export function parseAiReply(raw: string): AiReply {
  const text = stripFences(raw);
  const direct = tryParse(text);
  if (direct) return direct;

  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start >= 0 && end > start) {
    const embedded = tryParse(text.slice(start, end + 1));
    if (embedded) return embedded;
  }

  return { action: 'suggest', reply: text.slice(0, MAX_REPLY_CHARS) };
}
