/**
 * Public customer-site origin for loan / activation QR payloads.
 * Token only in the path — never phone, name, amount, or serial_number.
 */

export function readWebOrigin(
  raw: string | undefined = process.env.EXPO_PUBLIC_WEB_ORIGIN,
): string {
  const trimmed = (raw ?? '').trim().replace(/\/+$/, '');
  if (!trimmed) {
    throw new Error('EXPO_PUBLIC_WEB_ORIGIN is not set');
  }
  return trimmed;
}

/** Permanent receipt landing URL: /g/<public_token>. Does not grant access. */
export function loanLandingUrl(publicToken: string): string {
  return `${readWebOrigin()}/g/${encodeURIComponent(publicToken)}`;
}

/** Counter activation URL: /a/<login_token>. Single-use, short TTL. */
export function activationLandingUrl(loginToken: string): string {
  return `${readWebOrigin()}/a/${encodeURIComponent(loginToken)}`;
}
