import { useEffect, useRef, useState } from 'react';
import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';
import { api } from './client';

interface RealtimeConfig {
  url: string;
  key: string;
  topic: string;
  token: string;
  expiresIn: number;
}

export interface RealtimeEvent {
  conversationId: string;
}

const REFRESH_MARGIN_MS = 5 * 60 * 1000;

// Se suscribe al canal privado de la empresa en Supabase Realtime y escucha
// postgres_changes sobre las tablas de canales (RLS por company_id, filtrada
// además con el filter del suscriptor). Así la bandeja no hace polling: los
// eventos salen de la misma transacción que los escribe. Si /realtime/config
// responde 503 (falta SUPABASE_JWT_SECRET) o el canal se cae, `connected` pasa
// a false y la página cae al polling de respaldo.
export function useRealtime(companyId: number | undefined, onEvent: (event: RealtimeEvent) => void) {
  const handler = useRef(onEvent);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    handler.current = onEvent;
  }, [onEvent]);

  useEffect(() => {
    if (!companyId) return;

    let cancelled = false;
    let client: SupabaseClient | null = null;
    let channel: RealtimeChannel | null = null;
    let refreshTimer: ReturnType<typeof setTimeout> | null = null;

    async function fetchConfig(): Promise<RealtimeConfig | null> {
      try {
        const result = await api<{ data: RealtimeConfig }>('/realtime/config');
        return result.data;
      } catch {
        return null;
      }
    }

    async function refreshToken() {
      const config = await fetchConfig();
      if (cancelled || !client || !config) return;
      await client.realtime.setAuth(config.token);
      scheduleRefresh(config.expiresIn);
    }

    function scheduleRefresh(expiresIn: number) {
      if (refreshTimer) clearTimeout(refreshTimer);
      const ttl = Math.max(60_000, expiresIn * 1000 - REFRESH_MARGIN_MS);
      refreshTimer = setTimeout(() => void refreshToken(), ttl);
    }

    function notify(conversationId: string | undefined) {
      if (conversationId) handler.current({ conversationId });
    }

    async function connect() {
      const config = await fetchConfig();
      if (cancelled || !config) {
        setConnected(false);
        return;
      }

      if (!client) {
        // import dinamico: supabase-js (~280 kB) solo se carga al abrir la bandeja.
        const { createClient } = await import('@supabase/supabase-js');
        if (cancelled) return;
        client = createClient(config.url, config.key, {
          auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
        });
      }
      await client.realtime.setAuth(config.token);
      if (cancelled) return;

      if (channel) {
        const stale = channel;
        channel = null;
        void client.removeChannel(stale);
      }

      const filter = `companyId=eq.${companyId}`;
      channel = client
        .channel(config.topic, { config: { private: true } })
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'ChannelMessage', filter },
          (payload) => notify(payload.new?.conversationId),
        )
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'ChannelConversation', filter },
          (payload) => notify(payload.new?.id),
        )
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'ChannelConversation', filter },
          (payload) => notify(payload.new?.id),
        )
        .subscribe((status) => {
          if (cancelled) return;
          setConnected(status === 'SUBSCRIBED');
        });

      scheduleRefresh(config.expiresIn);
    }

    // Si el socket se cayó (dormir la pestaña, error de red), al volver a la
    // vista se reengancha; mientras tanto la página usa su polling de respaldo.
    function onVisible() {
      if (cancelled || document.visibilityState !== 'visible') return;
      if (channel && (channel.state === 'joining' || channel.state === 'joined')) return;
      void connect();
    }

    void connect();
    window.addEventListener('focus', onVisible);
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      cancelled = true;
      setConnected(false);
      window.removeEventListener('focus', onVisible);
      document.removeEventListener('visibilitychange', onVisible);
      if (refreshTimer) clearTimeout(refreshTimer);
      if (client && channel) void client.removeChannel(channel);
      client = null;
      channel = null;
    };
  }, [companyId]);

  return { connected };
}
