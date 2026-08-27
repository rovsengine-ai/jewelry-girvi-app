/**
 * Public customer-site origin for loan / activation QR payloads.
 * Token only in the path — never phone, name, amount, or serial_number.
 */
import { Platform } from 'react-native';

/** Canonical hosted shop site. Retired `jewelry-girvi-app.vercel.app` redirects here. */
export const CANONICAL_WEB_ORIGIN = 'https://girvi-sewa.vercel.app';

const RETIRED_WEB_HOSTS = ['jewelry-girvi-app.vercel.app'] as const;

function stripSlash(raw: string): string {
  return raw.trim().replace(/\/+$/, '');
}

function isRetiredOrigin(origin: string): boolean {
  return RETIRED_WEB_HOSTS.some((host) => origin.includes(host));
}

function canonicalize(origin: string): string {
  return isRetiredOrigin(origin) ? CANONICAL_WEB_ORIGIN : origin;
}

export function readWebOrigin(
  raw: string | undefined = process.env.EXPO_PUBLIC_WEB_ORIGIN,
): string {
  const inJest = typeof process !== 'undefined' && process.env.JEST_WORKER_ID != null;
  if (
    !inJest &&
    Platform.OS === 'web' &&
    typeof window !== 'undefined' &&
    window.location?.origin
  ) {
    return canonicalize(stripSlash(window.location.origin));
  }

  const trimmed = stripSlash(raw ?? '');
  if (!trimmed) {
    throw new Error('EXPO_PUBLIC_WEB_ORIGIN is not set');
  }
  return canonicalize(trimmed);
}

/** Permanent receipt landing URL: /g/<public_token>. Does not grant access. */
export function loanLandingUrl(publicToken: string): string {
  return `${readWebOrigin()}/g/${encodeURIComponent(publicToken)}`;
}

/** Counter activation URL: /a/<login_token>. Single-use, short TTL. */
export function activationLandingUrl(loginToken: string): string {
  return `${readWebOrigin()}/a/${encodeURIComponent(loginToken)}`;
}
