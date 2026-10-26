import type { CustomerApi, Locale } from '../../types/api';

/** Props every exported customer page receives (see docs/CLAUDE_HANDOFF.md). */
export interface CustomerPageProps {
  api: CustomerApi;
  locale: Locale;
  onLocaleChange: (locale: Locale) => void;
}

/** In-memory router state passed from BookingPage to ConfirmationPage. */
export type { BookingView } from '../../types/api';
