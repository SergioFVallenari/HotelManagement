interface GuestInput {
  firstName: string;
  lastName: string;
  phone?: string | null;
  email?: string | null;
}

export function reservationGuestWrite(companyId: number, guest: GuestInput) {
  const data = { ...guest, companyId };
  if (!guest.email) return { kind: 'create' as const, data };
  return {
    kind: 'upsert' as const,
    where: { companyId_email: { companyId, email: guest.email } },
    update: { firstName: guest.firstName, lastName: guest.lastName, ...(guest.phone ? { phone: guest.phone } : {}) },
    create: data,
  };
}
