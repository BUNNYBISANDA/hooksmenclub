import { useCallback, useEffect, useRef, useState } from 'react';
import type { ApiErrorCode, Availability, AvailabilityRequest, Catalog, CustomerApi } from '../../types/api';
import { readErrorCode } from '../../locales';

type Loadable<T> =
  | { status: 'loading' }
  | { status: 'ready'; data: T }
  | { status: 'error'; code: ApiErrorCode };

export function useCatalog(api: CustomerApi): Loadable<Catalog> & { reload: () => void } {
  const [state, setState] = useState<Loadable<Catalog>>({ status: 'loading' });
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setState({ status: 'loading' });
    api.getCatalog(controller.signal).then(
      (data) => { if (!controller.signal.aborted) setState({ status: 'ready', data }); },
      (error: unknown) => {
        const code = readErrorCode(error);
        if (code && !controller.signal.aborted) setState({ status: 'error', code });
      },
    );
    return () => controller.abort();
  }, [api, tick]);
  const reload = useCallback(() => setTick((n) => n + 1), []);
  return { ...state, reload };
}

/**
 * Server-side availability for one day. A null request means "nothing to look up yet".
 * Bump refreshToken to refetch the same request (e.g. after SLOT_UNAVAILABLE). Previous responses are aborted and stale ones are ignored, so a late response can never overwrite newer selections.
 */
export function useAvailability(api: CustomerApi, request: AvailabilityRequest | null, refreshToken = 0): Loadable<Availability> | { status: 'idle' } {
  type Keyed = (Loadable<Availability> & { key: string }) | null;
  const [state, setState] = useState<Keyed>(null);
  const requestKey = request ? JSON.stringify([[...request.serviceIds].sort(), request.barberId, request.date]) : null;
  const fullKey = requestKey ? `${requestKey}#${refreshToken}` : null;
  const requestRef = useRef(request);
  requestRef.current = request;

  useEffect(() => {
    const current = requestRef.current;
    if (!fullKey || !current) return;
    const controller = new AbortController();
    api.getAvailability(current, controller.signal).then(
      (data) => { if (!controller.signal.aborted) setState({ status: 'ready', data, key: fullKey }); },
      (error: unknown) => {
        const code = readErrorCode(error);
        if (code && !controller.signal.aborted) setState({ status: 'error', code, key: fullKey });
      },
    );
    return () => controller.abort();
  }, [api, fullKey]);

  if (!fullKey) return { status: 'idle' };
  // A response for a previous selection is never shown for the current one.
  if (!state || state.key !== fullKey) return { status: 'loading' };
  return state;
}
