export function billingAvailable(environment: string): boolean {
  return environment === 'testing' || environment === 'development';
}
