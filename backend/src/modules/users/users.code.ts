import { createHash, randomInt, timingSafeEqual } from 'node:crypto';

export function generateCode(): string {
  let code = '';
  for (let i = 0; i < 6; i++) code += randomInt(0, 10);
  return code;
}

export function hashCode(code: string, secret: string): string {
  return createHash('sha256').update(`${secret}:${code}`).digest('hex');
}

export function isCodeMatch(code: string, codeHash: string, secret: string): boolean {
  const expected = Buffer.from(hashCode(code, secret), 'utf8');
  const actual = Buffer.from(codeHash, 'utf8');
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export function isEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value);
}
