/**
 * Platform-hint redirects for loan (/g) and activation (/a) QR URLs.
 * No database access — never probe token validity here.
 *
 * User-Agent is a hint only. Wrong guesses must land on a working web page.
 */

export const ANDROID_PACKAGE_NAME = 'com.girvisewa.app';

/**
 * Where Android goes when the app is not installed.
 * Set to the Play Store listing URL when it exists, e.g.
 * `https://play.google.com/store/apps/details?id=com.girvisewa.app`
 * Until then, `null` means the web dashboard route (token preserved via `?open=web`).
 */
export const ANDROID_NO_APP_FALLBACK_URL: string | null = null;

export const CACHE_CONTROL_NO_STORE = 'no-store';

export type QrKind = 'g' | 'a';

/** Opaque path token: reject empty / path traversal; do not interpret contents. */
export function isOpaqueToken(token: string): boolean {
  if (token.length === 0 || token.length > 256) return false;
  if (token.includes('/') || token.includes('\\') || token.includes('..')) return false;
  return true;
}

/** Heuristic only — spoofable and often wrong. */
export function isAndroidUserAgent(userAgent: string | null): boolean {
  if (!userAgent) return false;
  return /android/i.test(userAgent);
}

export function webDashboardPath(kind: QrKind, token: string): string {
  return `/${kind}/${encodeURIComponent(token)}`;
}

/** Web SPA URL that skips a second Android Intent redirect. */
export function webFallbackUrl(origin: string, kind: QrKind, token: string): string {
  const url = new URL(webDashboardPath(kind, token), origin);
  url.searchParams.set('open', 'web');
  return url.toString();
}

export function resolveAndroidFallbackUrl(
  origin: string,
  kind: QrKind,
  token: string,
  override: string | null = ANDROID_NO_APP_FALLBACK_URL,
): string {
  if (override && override.trim() !== '') {
    return override.trim();
  }
  return webFallbackUrl(origin, kind, token);
}

/**
 * Android Intent URL that prefers the verified App Link (https), then falls back.
 * https://developer.chrome.com/docs/android/intents
 */
export function androidAppLinkIntentUrl(opts: {
  host: string;
  kind: QrKind;
  token: string;
  packageName?: string;
  fallbackUrl: string;
}): string {
  const path = webDashboardPath(opts.kind, opts.token);
  const pkg = opts.packageName ?? ANDROID_PACKAGE_NAME;
  const encodedFallback = encodeURIComponent(opts.fallbackUrl);
  return `intent://${opts.host}${path}#Intent;scheme=https;package=${pkg};S.browser_fallback_url=${encodedFallback};end`;
}

export function shouldServeWebShell(opts: {
  userAgent: string | null;
  searchParams: URLSearchParams;
}): boolean {
  if (opts.searchParams.get('open') === 'web') {
    return true;
  }
  return !isAndroidUserAgent(opts.userAgent);
}

export type QrRedirectDecision =
  | { type: 'intent'; location: string }
  | { type: 'spa' };

export function decideQrRedirect(opts: {
  kind: QrKind;
  token: string;
  origin: string;
  host: string;
  userAgent: string | null;
  searchParams: URLSearchParams;
}): QrRedirectDecision {
  if (shouldServeWebShell(opts)) {
    return { type: 'spa' };
  }

  const fallbackUrl = resolveAndroidFallbackUrl(opts.origin, opts.kind, opts.token);
  return {
    type: 'intent',
    location: androidAppLinkIntentUrl({
      host: opts.host,
      kind: opts.kind,
      token: opts.token,
      fallbackUrl,
    }),
  };
}
