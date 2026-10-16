import { Browser } from '@capacitor/browser';
import { Capacitor } from '@capacitor/core';

// Tiene que coincidir con APP_RETURN_TO del backend
// (src/modules/mercadopago/mp.return-to.ts) y con custom_url_scheme de
// strings.xml, que es lo que declara el intent-filter del deep link.
const APP_OAUTH_SCHEME = 'gestionhotel';
export const APP_RETURN_TO = `${APP_OAUTH_SCHEME}://oauth`;

export const isNative = Capacitor.isNativePlatform();

// MercadoPago deprecó las integraciones WebView y exige Chrome Custom Tabs
// en Android / Safari View Controller en iOS, asi que la autorización no se
// puede hacer dentro del WebView de la app. En web esto no se llama nunca: el
// flujo sigue siendo el popup de window.open.
export async function openAuthTab(url: string): Promise<void> {
  await Browser.open({ url, toolbarColor: '#ffffff' });
}

export async function closeAuthTab(): Promise<void> {
  await Browser.close();
}

// Devuelve el query de MercadoPago (mp=connected / mp=error&reason=...) o null
// si la URL no trae un resultado de OAuth. Solo mira el query y no el esquema
// para no depender del formato de la URL del deep link.
export function extractOauthQuery(url: string): string | null {
  const queryStart = url.indexOf('?');
  if (queryStart === -1) return null;
  const query = url.slice(queryStart + 1);
  return new URLSearchParams(query).has('mp') ? query : null;
}
