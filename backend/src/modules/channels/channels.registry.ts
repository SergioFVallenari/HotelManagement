import type { ChannelType } from '../../generated/prisma/enums.js';
import type { ChannelAdapter } from './channels.types.js';
import { instagramAdapter } from './adapters/instagram.adapter.js';

const ADAPTERS: Partial<Record<ChannelType, ChannelAdapter>> = {
  INSTAGRAM: instagramAdapter,
};

export function getAdapter(channel: ChannelType): ChannelAdapter {
  const adapter = ADAPTERS[channel];
  if (!adapter) {
    throw new Error(`No hay adaptador registrado para el canal ${channel}`);
  }
  return adapter;
}

export function hasAdapter(channel: ChannelType): boolean {
  return Boolean(ADAPTERS[channel]);
}
