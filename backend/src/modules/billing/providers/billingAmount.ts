function toCents(value: string): bigint | null {
  const match = /^(0|[1-9]\d{0,11})(?:\.(\d{1,2}))?$/.exec(value.trim());
  if (!match) return null;
  return BigInt(match[1]!) * 100n + BigInt((match[2] ?? '').padEnd(2, '0'));
}

export function billingAmountMatches(input: {
  expectedAmount: string;
  expectedCurrency: string;
  receivedAmount: string;
  receivedCurrency: string;
}): boolean {
  const expected = toCents(input.expectedAmount);
  const received = toCents(input.receivedAmount);
  return input.expectedCurrency === 'ARS' && input.receivedCurrency === input.expectedCurrency && expected !== null && received !== null && expected > 0n && expected === received;
}
