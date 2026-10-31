import type { CSSProperties } from 'react';

export interface BookingTheme {
  primary: string;
  secondary: string;
  accent: string;
  text: string;
  background: string;
  surface: string;
}

export const DEFAULT_BOOKING_THEME: BookingTheme = {
  primary: '#7650C7',
  secondary: '#B49AFF',
  accent: '#5DDBD5',
  text: '#EDF0FA',
  background: '#0B1020',
  surface: '#141929',
};

export const BOOKING_THEME_FIELDS: Array<{ key: keyof BookingTheme; label: string; usage: string }> = [
  { key: 'primary', label: 'Color principal', usage: 'Botones y acciones principales' },
  { key: 'secondary', label: 'Color secundario', usage: 'Bordes, detalles e iconos' },
  { key: 'accent', label: 'Color de acento', usage: 'Llamados a la acción y destacados' },
  { key: 'text', label: 'Color de texto', usage: 'Encabezados y textos' },
  { key: 'background', label: 'Fondo primario', usage: 'Fondo general de toda la página' },
  { key: 'surface', label: 'Fondo secundario', usage: 'Fondo del modal, formulario y tarjetas' },
];

export function bookingThemeFromConfig(config: unknown): BookingTheme {
  if (!config || typeof config !== 'object' || !('bookingTheme' in config)) return DEFAULT_BOOKING_THEME;
  const candidate = (config as { bookingTheme?: Partial<BookingTheme> }).bookingTheme;
  if (!candidate || typeof candidate !== 'object') return DEFAULT_BOOKING_THEME;
  const color = (key: keyof BookingTheme) => {
    const value = candidate[key];
    return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value)
      ? value.toUpperCase()
      : DEFAULT_BOOKING_THEME[key];
  };
  return {
    primary: color('primary'),
    secondary: color('secondary'),
    accent: color('accent'),
    text: color('text'),
    background: color('background'),
    surface: color('surface'),
  };
}

export function bookingThemeStyle(theme: BookingTheme): CSSProperties {
  const contrast = (hex: string) => {
    const channels = [1, 3, 5].map((start) => {
      const value = parseInt(hex.slice(start, start + 2), 16) / 255;
      return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
    });
    return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722 > 0.179 ? '#0B1020' : '#FFFFFF';
  };
  return {
    colorScheme: contrast(theme.background) === '#FFFFFF' ? 'dark' : 'light',
    '--booking-primary': theme.primary,
    '--booking-secondary': theme.secondary,
    '--booking-accent': theme.accent,
    '--booking-text': theme.text,
    '--booking-background': theme.background,
    '--booking-surface': theme.surface,
    '--booking-primary-contrast': contrast(theme.primary),
    '--booking-secondary-contrast': contrast(theme.secondary),
    '--booking-accent-contrast': contrast(theme.accent),
  } as CSSProperties;
}
