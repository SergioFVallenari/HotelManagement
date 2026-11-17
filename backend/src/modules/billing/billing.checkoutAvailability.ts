export function testCheckoutAvailable(config: { enabled: boolean; accessToken: string; monthlyPrice: string; webhookEnabled: boolean; webhookSecret: string }): boolean {
  const price = config.monthlyPrice.trim();
  return config.enabled && config.webhookEnabled && Boolean(config.accessToken.trim()) && Boolean(config.webhookSecret.trim()) && /^(0|[1-9]\d{0,9})(?:\.\d{1,2})?$/.test(price) && Number(price) > 0;
}
