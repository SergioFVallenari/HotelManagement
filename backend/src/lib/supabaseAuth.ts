import { createClient } from '@supabase/supabase-js';
import { env } from '../config/env.js';
import { AppError, conflict, forbidden, rateLimitExceeded, unauthorized } from './AppError.js';

const client = createClient(env.supabase.url, env.supabase.serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});
const publicAuthClient = createClient(
  env.supabase.url,
  env.supabase.anonKey,
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  },
);

interface GoTrueError {
  message?: string;
  code?: string;
  status?: number;
}

function toAppError(error: GoTrueError | null): AppError {
  switch (error?.code) {
    case 'invalid_credentials':
      return unauthorized('Email o contraseña incorrectos');
    case 'email_not_confirmed':
      return new AppError(403, 'EMAIL_NOT_CONFIRMED', 'Confirmá tu email antes de ingresar');
    case 'user_banned':
      return forbidden('Esta cuenta está deshabilitada');
    case 'user_already_exists':
    case 'email_exists':
      return conflict('DUPLICATE', 'Ya existe una cuenta con ese email');
    case 'weak_password':
      return new AppError(400, 'WEAK_PASSWORD', 'La contraseña es demasiado débil');
    case 'email_address_invalid':
    case 'validation_failed':
      return new AppError(400, 'VALIDATION_ERROR', 'Email inválido');
    case 'over_email_send_rate_limit':
    case 'over_request_rate_limit':
      return rateLimitExceeded();
    default:
      console.error('[auth] Error de Supabase Auth:', error?.code ?? error?.status, error?.message);
      return new AppError(500, 'AUTH_ERROR', 'No se pudo completar la operación de autenticación');
  }
}

export async function signInWithPassword(
  email: string,
  password: string,
): Promise<{ authUserId: string; accessToken: string }> {
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw toAppError(error);
  if (!data.user || !data.session) throw toAppError(null);
  return { authUserId: data.user.id, accessToken: data.session.access_token };
}

export async function resolveAuthUserId(accessToken: string): Promise<string> {
  const { data, error } = await client.auth.getUser(accessToken);
  if (error || !data.user) throw unauthorized('La sesión expiró. Volvé a ingresar');
  return data.user.id;
}

export async function signUpSelfService(input: {
  email: string;
  password: string;
  metadata: Record<string, unknown>;
  emailRedirectTo?: string;
}): Promise<void> {
  const { error } = await client.auth.signUp({
    email: input.email,
    password: input.password,
    options: {
      data: input.metadata,
      ...(input.emailRedirectTo ? { emailRedirectTo: input.emailRedirectTo } : {}),
    },
  });
  console.log('signUpSelfService', error);
  // Con email ya registrado GoTrue responde user_already_exists o un user sin
  // identities, a proposito, para no filtrar si la cuenta existe.
  if (error && error.code !== 'user_already_exists') throw toAppError(error);
}

export async function adminCreateUser(input: {
  email: string;
  password: string;
  metadata: Record<string, unknown>;
}): Promise<string> {
  const { data, error } = await client.auth.admin.createUser({
    email: input.email,
    password: input.password,
    email_confirm: true,
    user_metadata: input.metadata,
  });
  if (error) throw toAppError(error);
  if (!data.user) throw toAppError(null);
  return data.user.id;
}

export async function resendConfirmation(email: string, emailRedirectTo?: string): Promise<void> {
  const { error } = await client.auth.resend({
    type: 'signup',
    email,
    ...(emailRedirectTo ? { options: { emailRedirectTo } } : {}),
  });
  if (!error) return;
  if (error.code === 'over_email_send_rate_limit' || error.code === 'over_request_rate_limit') {
    throw toAppError(error);
  }
  console.warn('[auth] Reenvío de confirmación ignorado:', error.code, error.message);
}

export async function confirmEmail(
  tokenHash: string,
): Promise<void> {
  const { error } = await publicAuthClient.auth.verifyOtp({
    token_hash: tokenHash,
    type: 'email',
  });

  if (error) {
    console.warn('[auth] Error al confirmar email:', error.code);

    throw new AppError(
      400,
      'EMAIL_CONFIRMATION_FAILED',
      'El enlace de confirmación es inválido o expiró. Solicitá uno nuevo.',
    );
  }
}