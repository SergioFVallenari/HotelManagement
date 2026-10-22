import { useCallback, useEffect, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import {
  IconArrowLeft,
  IconBrandInstagram,
  IconMessages,
  IconPaperclip,
  IconRefresh,
  IconSend,
  IconSparkles,
} from '@tabler/icons-react';
import { api, buildQuery } from '../api/client';
import { useApi } from '../api/useApi';
import { useRealtime } from '../api/realtime';
import { useAuth } from '../auth/AuthContext';
import type {
  AiConfig,
  AiDraft,
  ChannelAttachment,
  ChannelConversation,
  ChannelType,
  MessageThread,
  Page,
} from '../api/types';
import { ErrorBanner, LoadState, Toast } from '../components/Feedback';
import { useApiError } from '../components/pagination';
import { messageTime } from '../lib/format';

const CHANNEL_LABELS: Record<ChannelType, string> = {
  INSTAGRAM: 'Instagram',
  FACEBOOK: 'Facebook',
  AIRBNB: 'Airbnb',
};

const ATTACHMENT_LABELS: Record<string, string> = {
  IMAGE: 'Imagen',
  VIDEO: 'Video',
  AUDIO: 'Audio',
  FILE: 'Archivo',
  STORY: 'Historia',
  SHARE: 'Publicación',
  SYSTEM: 'Mensaje del sistema',
};

function ChannelIcon({ channel, size = 16 }: { channel: ChannelType; size?: number }) {
  if (channel === 'INSTAGRAM') return <IconBrandInstagram size={size} />;
  return <IconMessages size={size} />;
}

function displayName(conversation: ChannelConversation): string {
  if (conversation.participantName) return conversation.participantName;
  if (conversation.participantHandle) return `@${conversation.participantHandle}`;
  return conversation.participantId;
}

function initials(conversation: ChannelConversation): string {
  const source = conversation.participantName || conversation.participantHandle || conversation.participantId;
  return source.slice(0, 1).toUpperCase();
}

function AttachmentView({ attachment }: { attachment: ChannelAttachment }) {
  if (!attachment.url) {
    return <span className="inbox-attachment-link text-secondary">{ATTACHMENT_LABELS[attachment.type] ?? 'Adjunto'}</span>;
  }
  if (attachment.type === 'IMAGE') {
    return (
      <a href={attachment.url} target="_blank" rel="noreferrer" className="d-inline-block">
        <img src={attachment.url} alt="Adjunto" className="inbox-attachment-img" loading="lazy" />
      </a>
    );
  }
  return (
    <a href={attachment.url} target="_blank" rel="noreferrer" className="inbox-attachment-link">
      <IconPaperclip size={15} /> {ATTACHMENT_LABELS[attachment.type] ?? 'Adjunto'}
    </a>
  );
}

export function MessagesPage() {
  const [channel, setChannel] = useState<'' | ChannelType>('');
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [activeId, setActiveId] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [drafting, setDrafting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [syncToast, setSyncToast] = useState<string | null>(null);
  const { user } = useAuth();
  const { error, handleError, clearError } = useApiError();
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const syncingRef = useRef(false);
  const realtimeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingThreadRef = useRef(false);
  const realtimeActionsRef = useRef<{ refresh: () => Promise<unknown>; refreshThread: () => Promise<unknown> }>({
    refresh: () => Promise.resolve(null),
    refreshThread: () => Promise.resolve(null),
  });

  const { connected } = useRealtime(user?.companyId, (event) => {
    if (activeId && event.conversationId === activeId) pendingThreadRef.current = true;
    if (realtimeTimerRef.current) return;
    realtimeTimerRef.current = setTimeout(() => {
      realtimeTimerRef.current = null;
      const withThread = pendingThreadRef.current;
      pendingThreadRef.current = false;
      void realtimeActionsRef.current.refresh();
      if (withThread) void realtimeActionsRef.current.refreshThread();
    }, 300);
  });

  useEffect(() => () => {
    if (realtimeTimerRef.current) clearTimeout(realtimeTimerRef.current);
  }, []);

  useEffect(() => {
    const id = setTimeout(() => setSearch(searchInput.trim()), 300);
    return () => clearTimeout(id);
  }, [searchInput]);

  const query = buildQuery({
    channel: channel || undefined,
    unread: unreadOnly ? 'true' : undefined,
    q: search || undefined,
    pageSize: 50,
  });

  const { data, loading, error: listError, reload, refresh } = useApi<Page<ChannelConversation>>(
    `/conversations${query}`,
    { pollMs: connected ? undefined : 300000 },
  );

  const { data: aiConfigData } = useApi<{ data: AiConfig }>('/ai/config');
  const aiConfigured = aiConfigData?.data.configured ?? false;

  const conversations = data?.data ?? [];
  const active = activeId ? conversations.find((c) => c.id === activeId) ?? null : null;

  const {
    data: thread,
    loading: threadLoading,
    error: threadError,
    refresh: refreshThread,
  } = useApi<MessageThread>(activeId ? `/conversations/${activeId}/messages` : '', {
    pollMs: connected ? undefined : 300000,
  });

  const messages = (thread?.data ?? []).filter((m) => m.conversationId === activeId);
  const activeUnread = active?.unreadCount ?? 0;

  useEffect(() => {
    realtimeActionsRef.current = { refresh, refreshThread };
  });

  const syncNow = useCallback(async () => {
    if (syncingRef.current) return;
    syncingRef.current = true;
    setSyncing(true);
    setSyncError(null);
    try {
      await api('/integrations/instagram/sync', { method: 'POST' });
      await Promise.all([refresh(), activeId ? refreshThread() : Promise.resolve(null)]);
      setSyncToast('Bandeja sincronizada.');
    } catch (err) {
      setSyncError((err as Error).message);
    } finally {
      syncingRef.current = false;
      setSyncing(false);
    }
  }, [activeId, refresh, refreshThread]);

  useEffect(() => {
    if (!activeId || activeUnread === 0) return;
    let cancelled = false;
    api(`/conversations/${activeId}/read`, { method: 'POST' })
      .then(() => {
        if (!cancelled) void refresh();
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [activeId, activeUnread, refresh]);

  useEffect(() => {
    function onVisible() {
      if (document.visibilityState !== 'visible') return;
      void refresh();
      void refreshThread();
    }
    window.addEventListener('focus', onVisible);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener('focus', onVisible);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [refresh, refreshThread]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ block: 'end' });
  }, [messages.length, activeId]);

  async function send() {
    const value = text.trim();
    if (!activeId || !value || sending) return;
    setSending(true);
    clearError();
    try {
      await api(`/conversations/${activeId}/messages`, { method: 'POST', body: { text: value } });
      setText('');
      await Promise.all([refreshThread(), refresh()]);
    } catch (err) {
      handleError(err);
    } finally {
      setSending(false);
    }
  }

  async function generateDraft() {
    if (!activeId || drafting || sending) return;
    setDrafting(true);
    clearError();
    try {
      // 60 s: el backend puede demorar hasta ~50 s (3 intentos de 15 s contra
      // Gemini + backoff), con los 10 s por defecto la request se cancelaba.
      const result = await api<{ data: AiDraft }>(`/conversations/${activeId}/ai/draft`, {
        method: 'POST',
        timeoutMs: 60000,
      });
      setText(result.data.reply);
    } catch (err) {
      handleError(err);
    } finally {
      setDrafting(false);
    }
  }

  function onComposerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      void send();
    }
  }

  const windowEnd = active?.replyWindowEndsAt ? messageTime(active.replyWindowEndsAt) : null;

  return (
    <div className={`inbox ${activeId ? 'inbox--thread-open' : ''}`}>
      <div className="inbox-quick-actions">
        <button
          type="button"
          className="btn btn-sm btn-outline-secondary"
          onClick={() => void syncNow()}
          disabled={syncing}
          title="Sincronizar conversaciones con Instagram"
        >
          {syncing ? <span className="spinner-border spinner-border-sm" /> : <IconRefresh size={15} />}
        </button>
      </div>
      <Toast show={syncToast !== null} message={syncToast ?? ''} onHide={() => setSyncToast(null)} />
      <aside className="inbox-list">
        <div className="inbox-list-header">
          <div className="d-flex align-items-center gap-2 mb-2">
            <h1 className="h5 mb-0 flex-grow-1">Mensajes</h1>
            <button
              type="button"
              className={`btn btn-sm ${unreadOnly ? 'btn-primary' : 'btn-outline-secondary'}`}
              onClick={() => setUnreadOnly((v) => !v)}
            >
              No leídos
            </button>
          </div>
          <div className="d-flex gap-2">
            <select
              className="form-select form-select-sm"
              value={channel}
              onChange={(e) => setChannel(e.target.value as '' | ChannelType)}
              aria-label="Filtrar por canal"
            >
              <option value="">Todos los canales</option>
              <option value="INSTAGRAM">Instagram</option>
              <option value="FACEBOOK">Facebook</option>
              <option value="AIRBNB">Airbnb</option>
            </select>
            <input
              type="search"
              className="form-control form-control-sm"
              placeholder="Buscar contacto…"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              aria-label="Buscar contacto"
            />
          </div>
        </div>

        <div className="inbox-list-body">
          {syncError && (
            <div className="px-2 pt-2">
              <ErrorBanner message={syncError} onDismiss={() => setSyncError(null)} />
            </div>
          )}
          <LoadState
            loading={loading}
            error={listError}
            onRetry={reload}
            empty={conversations.length === 0}
          />
          {conversations.map((conversation) => (
            <button
              key={conversation.id}
              type="button"
              className={`inbox-item ${conversation.id === activeId ? 'active' : ''}`}
              onClick={() => {
                setActiveId(conversation.id);
                clearError();
              }}
            >
              <span className="inbox-avatar">
                {conversation.participantAvatar ? (
                  <img src={conversation.participantAvatar} alt="" />
                ) : (
                  initials(conversation)
                )}
              </span>
              <span className="inbox-item-main">
                <span className="inbox-item-top">
                  <span className="inbox-item-name text-truncate">{displayName(conversation)}</span>
                  <span className="inbox-item-time">{messageTime(conversation.lastMessageAt)}</span>
                </span>
                <span className="inbox-item-bottom">
                  <span className="inbox-item-channel">
                    <ChannelIcon channel={conversation.channel} size={13} /> {CHANNEL_LABELS[conversation.channel]}
                  </span>
                  <span className="inbox-item-preview text-truncate">
                    {conversation.lastMessagePreview ?? 'Sin mensajes'}
                  </span>
                  {conversation.unreadCount > 0 && (
                    <span className="badge rounded-pill text-bg-primary">{conversation.unreadCount}</span>
                  )}
                </span>
              </span>
            </button>
          ))}
        </div>
      </aside>

      <section className="inbox-thread">
        {!activeId ? (
          <div className="inbox-empty text-secondary">Elegí una conversación para ver los mensajes.</div>
        ) : (
          <>
            <header className="inbox-thread-header">
              <button
                type="button"
                className="btn btn-sm btn-outline-secondary inbox-back"
                onClick={() => setActiveId(null)}
                aria-label="Volver a la lista"
              >
                <IconArrowLeft size={16} />
              </button>
              <span className="inbox-avatar inbox-avatar-sm">
                {active?.participantAvatar ? <img src={active.participantAvatar} alt="" /> : active ? initials(active) : ''}
              </span>
              <div className="flex-grow-1" style={{ minWidth: 0 }}>
                <div className="fw-semibold text-truncate">{active ? displayName(active) : ''}</div>
                <div className="small text-secondary d-flex align-items-center gap-1">
                  {active && (
                    <>
                      <ChannelIcon channel={active.channel} size={13} /> {CHANNEL_LABELS[active.channel]}
                    </>
                  )}
                </div>
              </div>
            </header>

            <div className="inbox-thread-body">
              <LoadState
                loading={threadLoading && messages.length === 0}
                error={threadError}
                onRetry={() => void refreshThread()}
                empty={!threadLoading && messages.length === 0}
              />
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={`inbox-msg ${message.direction === 'OUT' ? 'inbox-msg--out' : 'inbox-msg--in'}`}
                >
                  <div className="inbox-bubble">
                    {message.text && <div className="inbox-msg-text">{message.text}</div>}
                    {message.attachments?.map((attachment, index) => (
                      <AttachmentView key={index} attachment={attachment} />
                    ))}
                  </div>
                  <div className="inbox-msg-time">{messageTime(message.sentAt)}</div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>

            <footer className="inbox-composer">
              {error && (
                <div className="alert alert-danger py-2 px-3 mb-2 d-flex justify-content-between align-items-center">
                  <span className="small">{error}</span>
                  <button type="button" className="btn-close" onClick={clearError} aria-label="Cerrar" />
                </div>
              )}
              {active && !active.canReply && (
                <div className="alert alert-warning py-2 px-3 mb-2 small">
                  Pasaron más de 24 horas desde el último mensaje del huésped
                  {windowEnd ? ` (${windowEnd})` : ''}. No se puede responder hasta que vuelva a escribir.
                </div>
              )}
              <div className="d-flex gap-2 align-items-end">
                <textarea
                  className="form-control"
                  rows={2}
                  placeholder={active?.canReply ? 'Escribí una respuesta…' : 'Ventana de respuesta cerrada'}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  onKeyDown={onComposerKeyDown}
                  disabled={!active?.canReply || sending}
                />
                {aiConfigured && (
                  <button
                    type="button"
                    className="btn btn-outline-secondary"
                    onClick={() => void generateDraft()}
                    disabled={!active?.canReply || drafting || sending}
                    title="Sugerir respuesta con el asistente de IA"
                  >
                    {drafting ? <span className="spinner-border spinner-border-sm" /> : <IconSparkles size={18} />}
                  </button>
                )}
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => void send()}
                  disabled={!active?.canReply || sending || text.trim().length === 0}
                >
                  {sending ? <span className="spinner-border spinner-border-sm" /> : <IconSend size={18} />}
                </button>
              </div>
              <div className="small text-secondary mt-1">Enter para enviar · Shift+Enter para salto de línea</div>
            </footer>
          </>
        )}
      </section>
    </div>
  );
}
