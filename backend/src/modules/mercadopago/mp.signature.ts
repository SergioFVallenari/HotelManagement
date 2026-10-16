export const SIGNATURE_TOLERANCE_MS = 300_000;

const SECONDS_CUTOFF = 1e11;

function firstHeaderValue(value: string | string[] | undefined): string | undefined {
  const raw = Array.isArray(value) ? value[0] : value;
  if (raw === undefined || raw === null) return undefined;
  const trimmed = String(raw).trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function buildManifestDataId(dataId: string | number | undefined | null): string {
  if (dataId === undefined || dataId === null) return '';
  return String(dataId).trim().toLowerCase();
}

export function readSignatureTs(xSignature: string | string[] | undefined): string | undefined {
  const header = firstHeaderValue(xSignature);
  if (header === undefined) return undefined;
  for (const part of header.split(',')) {
    const separator = part.indexOf('=');
    if (separator === -1) continue;
    if (part.substring(0, separator).trim().toLowerCase() !== 'ts') continue;
    const value = part.substring(separator + 1).trim();
    if (/^\d+$/.test(value)) return value;
  }
  return undefined;
}

export function toEpochMs(ts: string): number | undefined {
  if (!/^\d+$/.test(ts.trim())) return undefined;
  const value = Number(ts.trim());
  return value >= SECONDS_CUTOFF ? value : value * 1000;
}
