export interface AuthUser {
  id: number;
  username: string;
  role: 'ADMIN' | 'RECEPCIONISTA' | 'OWNER';
  name?: string | null;
  email?: string | null;
  companyId: number;
}