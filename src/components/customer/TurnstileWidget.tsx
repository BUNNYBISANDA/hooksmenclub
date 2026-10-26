import { useEffect, useRef, useState } from 'react';
import type { Locale } from '../../types/api';
import type { Copy } from '../../locales';

interface TurnstileApi {
  render(container: HTMLElement, options: Record<string, unknown>): string;
  reset(widgetId: string): void;
  remove(widgetId: string): void;
}
declare global { interface Window { turnstile?: TurnstileApi } }

const SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
let scriptPromise: Promise<TurnstileApi> | null = null;

function loadTurnstile(): Promise<TurnstileApi> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  scriptPromise ??= new Promise<TurnstileApi>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = SCRIPT_SRC;
    script.async = true;
    script.onload = () => (window.turnstile ? resolve(window.turnstile) : reject(new Error('turnstile')));
    script.onerror = () => { scriptPromise = null; script.remove(); reject(new Error('turnstile')); };
    document.head.appendChild(script);
  });
  return scriptPromise;
}

interface Props {
  siteKey: string;
  locale: Locale;
  copy: Copy;
  /** Increment after every submit attempt: Turnstile tokens are single-use, so the widget is reset to issue a new one. */
  resetSignal: number;
  onToken: (token: string | null) => void;
}

export function TurnstileWidget({ siteKey, locale, copy, resetSignal, onToken }: Props) {
  const container = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | null>(null);
  const onTokenRef = useRef(onToken);
  onTokenRef.current = onToken;
  const [failed, setFailed] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setFailed(false);
    setReady(false);
    loadTurnstile().then(
      (turnstile) => {
        if (cancelled || !container.current) return;
        widgetId.current = turnstile.render(container.current, {
          sitekey: siteKey,
          action: 'booking',
          theme: 'dark',
          language: locale,
          callback: (token: string) => onTokenRef.current(token),
          'expired-callback': () => onTokenRef.current(null),
          'error-callback': () => onTokenRef.current(null),
        });
        setReady(true);
      },
      () => { if (!cancelled) setFailed(true); },
    );
    return () => {
      cancelled = true;
      onTokenRef.current(null);
      if (widgetId.current && window.turnstile) window.turnstile.remove(widgetId.current);
      widgetId.current = null;
    };
  }, [siteKey, locale]);

  const firstSignal = useRef(resetSignal);
  useEffect(() => {
    if (resetSignal === firstSignal.current) return;
    onTokenRef.current(null);
    if (widgetId.current && window.turnstile) window.turnstile.reset(widgetId.current);
  }, [resetSignal]);

  return (
    <div>
      <p className="mb-2 font-medium">{copy.booking.captchaLabel}</p>
      <div ref={container} className="min-h-[65px]" />
      {!ready && !failed ? <p role="status" className="text-sm text-muted">{copy.booking.captchaLoading}</p> : null}
      {failed ? <p role="alert" className="text-sm font-medium text-[#a3261a]">{copy.booking.captchaScriptFailed}</p> : null}
    </div>
  );
}
