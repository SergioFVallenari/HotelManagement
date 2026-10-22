// Metadata que viaja en raw_user_meta_data y consume el trigger sync_auth_user
// para crear la fila de app. Se arma solo server-side: el alta interna nunca debe
// aceptar un company_id que venga del cliente.

export interface SelfServiceMetadataInput {
  username: string;
  name?: string | null;
  hotelName: string;
}

export function buildSelfServiceMetadata(input: SelfServiceMetadataInput): Record<string, unknown> {
  return {
    username: input.username,
    ...(input.name ? { name: input.name } : {}),
    role: 'OWNER',
    hotel_name: input.hotelName,
  };
}

export interface InternalMetadataInput {
  username: string;
  name?: string | null;
  role: 'ADMIN' | 'RECEPCIONISTA' | 'OWNER';
  companyId: number;
  createdById: number | null;
  isActive: boolean;
}

export function buildInternalMetadata(input: InternalMetadataInput): Record<string, unknown> {
  return {
    username: input.username,
    ...(input.name ? { name: input.name } : {}),
    role: input.role,
    company_id: input.companyId,
    ...(input.createdById !== null ? { created_by_id: input.createdById } : {}),
    is_active: input.isActive,
  };
}
