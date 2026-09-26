import { AppError } from '../../lib/AppError.js';

let lastFailure: { status: number; body: string } | null = null;
let installed = false;

export function captureMpFailures(): void {
  if (installed) return;
  installed = true;

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input: Parameters<typeof originalFetch>[0], init?: Parameters<typeof originalFetch>[1]) => {
    const res = await originalFetch(input, init);
    if (!res.ok) {
      try {
        lastFailure = { status: res.status, body: (await res.clone().text()).slice(0, 1000) };
      } catch {
        lastFailure = null;
      }
    }
    return res;
  };
}

function takeLastFailure(): { status: number; body: string } | null {
  const failure = lastFailure;
  lastFailure = null;
  return failure;
}

function asRecord(err: unknown): Record<string, unknown> {
  return err && typeof err === 'object' ? (err as Record<string, unknown>) : {};
}

export function toMpAppError(err: unknown, code: string, message: string): AppError {
  const failure = takeLastFailure();
  const record = asRecord(err);
  const causes = record.causes;
  const upstreamError = record.error;

  console.error('[mp] fallo la operacion', {
    code,
    status: record.status ?? failure?.status,
    upstreamError: upstreamError ? String(upstreamError) : undefined,
    causes: Array.isArray(causes) && causes.length > 0 ? causes : undefined,
    responseBody: failure?.body,
  });

  const details: Record<string, unknown> = {};
  if (typeof record.status === 'number') details.upstreamStatus = record.status;
  if (upstreamError) details.upstreamError = String(upstreamError);
  if (Array.isArray(causes) && causes.length > 0) details.causes = causes;
  if (failure?.body) details.responseBody = failure.body;

  return new AppError(502, code, message, Object.keys(details).length > 0 ? details : undefined);
}
