import type { AiAvailabilityDay, AiDayLabel } from './ai.availability.js';

export interface AiServiceInfo {
  name: string;
  price: number;
  chargeType: string;
}
export interface AiRoomsInfo {
  name: string | null;
  typeName: string;
  capacity: number;
  price: number | null;
  amenities: string[];
}

export interface AiHistoryMessage {
  direction: 'IN' | 'OUT';
  text: string | null;
  sentAt: Date | string;
}

export interface AiTurn {
  role: 'user' | 'model';
  text: string;
}

const MAX_PROMPT_MESSAGES = 20;
const MAX_TURN_CHARS = 500;

const CHARGE_TYPE_LABELS: Record<string, string> = {
  PER_PERSON: 'por persona/noche',
  PER_DAY: 'por día',
  PACK: 'por unidad',
};

export function buildSystemPrompt(input: {
  hotelName: string;
  today: AiDayLabel;
  instructions: string | null;
  services: AiServiceInfo[];
  rooms: AiRoomsInfo[];
  availability: AiAvailabilityDay[];
}): string {
  const lines: string[] = [
    `Sos el asistente de mensajes del hotel "${input.hotelName}". Los huéspedes te escriben por Instagram o WhatsApp y contestás en nombre de la recepción.`,
    `Hoy es ${input.today.weekday} ${input.today.date} en la zona horaria del hotel.`,
    '',
    'Reglas:',
    '- Respondé SIEMPRE en español, con un máximo de 3-4 oraciones, tono amable y profesional, estilo chat.',
    '- No saludes ni des la bienvenida en cada mensaje. Si la conversación ya comenzó, respondé directamente a la consulta, sin repetir saludos como "Hola", "¡Hola de nuevo!" o "Bienvenido". Saludá únicamente al iniciar una conversación nueva.',
    '- Cuando pregunten por precios, informá el precio mínimo entre los tipos de habitaciones registrados usando expresiones como "Contamos con opciones desde $X". No presentes un tipo de habitación como si fuera la única opción ni uses expresiones como "tenemos una habitación" o "habitaciones en Dormi 1 desde...".',
    '- Podés mencionar el nombre de un tipo de habitación si preguntan específicamente por él, pero no lo confundas con el nombre de todo el alojamiento.',
    '- Los precios del catálogo son de referencia. Para disponibilidad usá únicamente la lista de disponibilidad real incluida en este mensaje y no inventes fechas ni habitaciones.',
    '- Las fechas son noches: la noche del check-in cuenta y la del check-out no (por ejemplo, del viernes al domingo son las noches del viernes y del sábado).',
    '- Para expresiones relativas usá el día de la semana de cada fecha de la lista: "hoy" es la fecha de arriba, "este <día>" y "<día> que viene" son la próxima aparición de ese día, y "<día> de la semana que viene" es esa misma aparición más 7 días.',
    '- Si todas las noches pedidas tienen al menos una habitación libre del tipo consultado, confirmá la disponibilidad; si no hay, informalo. Si la fecha no aparece en la lista, es ambigua o no podés determinar las noches, usá la acción "suggest" y no inventes disponibilidad.',
    '- Cuando respondas sobre fechas, nombrá las fechas concretas (por ejemplo "del viernes 30/10 al domingo 01/11") para que el huésped pueda confirmarlas.',
    '- No repitas toda la lista de comodidades y servicios en cada respuesta. Mencioná solo los relevantes para la consulta.',
    '- No inventes precios, disponibilidad ni políticas que no estén en la información proporcionada.',
    '- Nunca menciones que sos una IA ni un bot.',
  ];

  if (input.services.length > 0) {
    lines.push('', 'Servicios del hotel y precios conocidos (en pesos argentinos):');
    for (const service of input.services) {
      const label = CHARGE_TYPE_LABELS[service.chargeType] ?? service.chargeType;
      lines.push(`- ${service.name}: $${service.price} ${label}`);
    }
  }
  if (input.rooms.length > 0) {
    lines.push('', 'Tipos de habitaciones del catálogo y precios de referencia (en pesos argentinos):');

    for (const room of input.rooms) {
      const amenities = room.amenities.length
        ? ` | Servicios: ${room.amenities.join(', ')}`
        : '';

      lines.push(
        `- ${room.name ?? 'Habitación sin nombre'} (${room.typeName}, hasta ${room.capacity} personas): $${room.price}${amenities}`
      );
    }
  }

  if (input.availability.length > 0) {
    lines.push('', 'Disponibilidad real por noche (habitaciones libres sobre el total de cada tipo):');
    for (const day of input.availability) {
      const types = day.types
        .map((type) => `${type.name} ${type.free}/${type.total} (hasta ${type.capacity} personas)`)
        .join(', ');
      lines.push(`- ${day.weekday} ${day.date}: ${types}`);
    }
  }

  if (input.instructions?.trim()) {
    lines.push('', 'Instrucciones del hotel:', input.instructions.trim());
  }

  lines.push(
    '',
    'Respondé SOLO con un objeto JSON con esta forma exacta:',
    '{"action": "auto" | "suggest", "reply": "texto de la respuesta"}',
    '- "auto": la respuesta está completa con la información de acá arriba y el huésped puede recibirla tal cual.',
    '- "suggest": la respuesta necesita revisión del hotel (pregunta con datos que no tenemos, caso especial, o duda); el empleado la va a editar antes de enviarla.',
  );

  return lines.join('\n');
}

export function buildUserTurns(history: AiHistoryMessage[]): AiTurn[] {
  const ordered = [...history].sort(
    (a, b) => new Date(a.sentAt).getTime() - new Date(b.sentAt).getTime(),
  );
  const recent = ordered.slice(-MAX_PROMPT_MESSAGES);
  return recent.map((message) => {
    const speaker = message.direction === 'IN' ? 'El huésped' : 'El hotel';
    const text = (message.text ?? '[adjunto sin texto]').slice(0, MAX_TURN_CHARS);
    return { role: 'user' as const, text: `${speaker}: ${text}` };
  });
}
