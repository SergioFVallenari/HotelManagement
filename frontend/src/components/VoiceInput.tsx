import { useEffect, useRef, useState } from 'react';
import { IconMicrophone, IconPlayerStop } from '@tabler/icons-react';
import { nativeVoiceInput, voiceInputSupport } from '../api/voiceInput';
import { createBrowserVoiceSession, createNativeVoiceSession, type VoiceSession } from '../lib/voiceInput';

interface Props {
  disabled: boolean;
  onText: (text: string) => void;
  onActiveChange: (active: boolean) => void;
}

export function VoiceInput({ disabled, onText, onActiveChange }: Props) {
  const [support] = useState(voiceInputSupport);
  const [active, setActive] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [preview, setPreview] = useState('');
  const [error, setError] = useState<string | null>(null);
  const session = useRef<VoiceSession | null>(null);

  useEffect(() => {
    const handleHidden = () => {
      if (document.hidden && session.current?.canStop) session.current.stop();
    };
    document.addEventListener('visibilitychange', handleHidden);
    return () => {
      document.removeEventListener('visibilitychange', handleHidden);
      session.current?.cancel();
      session.current = null;
    };
  }, []);

  function start() {
    if (disabled || session.current || support.reason) return;
    setError(null);
    setPreview('');
    setStopping(false);
    const callbacks = {
      onPreview: setPreview,
      onError: setError,
      onComplete: (text: string) => {
        session.current = null;
        setActive(false);
        setStopping(false);
        setPreview('');
        onActiveChange(false);
        if (text) onText(text);
      },
    };
    const controller = support.native ? createNativeVoiceSession(() => nativeVoiceInput.start(), callbacks)
      : createBrowserVoiceSession(support.recognition!, callbacks);
    session.current = controller;
    setActive(true);
    onActiveChange(true);
    controller.start();
  }

  function stop() {
    if (!session.current?.canStop) return;
    setStopping(true);
    session.current.stop();
  }

  return <div className="mt-2">
    <button type="button" className={`btn ${active ? 'btn-danger' : 'btn-outline-secondary'} d-inline-flex align-items-center gap-2`}
      disabled={active ? stopping || support.native : disabled || Boolean(support.reason)}
      onClick={active ? stop : start} aria-pressed={active} aria-describedby="voice-input-help">
      {active ? <IconPlayerStop size={18} aria-hidden="true" /> : <IconMicrophone size={18} aria-hidden="true" />}
      {active ? stopping ? 'Finalizando dictado…' : support.native ? 'Dictando en el sistema…' : 'Terminar dictado' : 'Dictar pedido'}
    </button>
    <p id="voice-input-help" className="small text-secondary mt-2 mb-1">
      {support.reason ?? 'Español (Argentina). El dictado se agrega al texto, no se envía automáticamente. Revisá fechas, nombres y cantidades antes de enviarlo.'}
    </p>
    {!support.reason && <p className="small text-secondary mb-1">El navegador o el sistema pueden enviar el audio a su proveedor de reconocimiento. Nuestro backend solo recibe el texto al tocar Enviar.</p>}
    {active && <div role="status" className="small border rounded p-2 my-2" style={{ whiteSpace: 'pre-wrap' }}>
      {preview || (support.native ? 'Completá o cancelá el dictado en el diálogo del sistema.' : 'Escuchando… Hablá y tocá Terminar dictado. Máximo: 60 segundos.')}
    </div>}
    {error && <p role="alert" className="text-danger small mb-1">{error}</p>}
  </div>;
}
