import { prisma } from '../../config/prisma.js';
import { AppError } from '../../lib/AppError.js';
import type { CreateRecipientInput, UpdateRecipientInput } from './recipients.schema.js';

const RECIPIENT_SELECT = {
  id: true,
  name: true,
  email: true,
  enabled: true,
  createdAt: true,
  updatedAt: true,
} as const;

export function getRecipients(companyId: number) {
  return prisma.companyNotificationRecipient.findMany({
    where: { companyId },
    select: RECIPIENT_SELECT,
    orderBy: [{ name: 'asc' }, { id: 'asc' }],
  });
}

export function getEnabledRecipients(companyId: number) {
  return prisma.companyNotificationRecipient.findMany({
    where: { companyId, enabled: true },
    select: { id: true, name: true, email: true },
    orderBy: { id: 'asc' },
  });
}

export function createRecipient(companyId: number, input: CreateRecipientInput) {
  return prisma.companyNotificationRecipient.create({
    data: { ...input, companyId },
    select: RECIPIENT_SELECT,
  });
}

export function saveRecipient(companyId: number, id: number, input: UpdateRecipientInput) {
  return prisma.companyNotificationRecipient.update({
    where: { id, companyId },
    data: input,
    select: RECIPIENT_SELECT,
  });
}

export async function removeRecipient(companyId: number, id: number): Promise<void> {
  const result = await prisma.companyNotificationRecipient.deleteMany({ where: { id, companyId } });
  if (result.count === 0) throw new AppError(404, 'DESTINATARIO_NO_ENCONTRADO', 'El destinatario no existe en este hotel');
}
