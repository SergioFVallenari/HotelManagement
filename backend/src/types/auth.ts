export interface AuthUser {
  id: number;
  username: string;
  role: 'ADMIN' | 'RECEPCIONISTA';
  name?: string | null;
  companyId: number;
}