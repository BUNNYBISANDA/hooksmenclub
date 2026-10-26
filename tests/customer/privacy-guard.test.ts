import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const roots = ['src/features/public-site', 'src/features/booking', 'src/features/manage-booking', 'src/components/customer', 'src/locales'];

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? files(full) : /\.(ts|tsx)$/.test(name) ? [full] : [];
  });
}

const sources = roots.flatMap(files).map((path) => ({ path, text: readFileSync(path, 'utf8') }));

// Customer data and manage tokens must live in component/router memory only.
describe('customer code never persists or leaks personal data', () => {
  const forbidden: [string, RegExp][] = [
    ['localStorage', /\blocalStorage\b/],
    ['sessionStorage', /\bsessionStorage\b/],
    ['indexedDB', /\bindexedDB\b/],
    ['document.cookie', /document\.cookie/],
    ['console output', /\bconsole\.(log|info|warn|error|debug|trace)\b/],
    ['analytics (gtag/dataLayer/fbq/posthog/amplitude/segment)', /\b(gtag|dataLayer|fbq|posthog|amplitude|analytics\.track|mixpanel)\b/i],
    ['sendBeacon', /sendBeacon/],
    ['token in query string', /\?(?:[^\s'"`#]*&)?token=/],
  ];
  it.each(forbidden)('has no %s', (_label, pattern) => {
    const hits = sources.filter((s) => pattern.test(s.text)).map((s) => s.path);
    expect(hits).toEqual([]);
  });

  it('only removes the manage fragment with history.replaceState', () => {
    const page = sources.find((s) => s.path.endsWith('ManageBookingPage.tsx'))!;
    expect(page.text).toContain('window.history.replaceState');
  });

  it('never reads the thrown error message (it may echo request data)', () => {
    const hits = sources.filter((s) => /\.(message|stack)\b/.test(s.text)).map((s) => s.path);
    expect(hits).toEqual([]);
  });
});
