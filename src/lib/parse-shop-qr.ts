/**
 * Decode shop QR payloads. Receipt QRs are /g/<public_token>; activation QRs
 * are /a/<login_token>. Token stays opaque — never serial, phone, or amount.
 */

export type ShopQrPayload =
  | { kind: 'loan'; token: string }
  | { kind: 'activation'; token: string };

function decodeSegment(raw: string): string {
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

function fromPathname(pathname: string): ShopQrPayload | null {
  const match = pathname.match(/\/([ga])\/([^/]+)/);
  if (!match) return null;
  const token = decodeSegment(match[2]).trim();
  if (!token) return null;
  return match[1] === 'g' ? { kind: 'loan', token } : { kind: 'activation', token };
}

export function parseShopQr(raw: string): ShopQrPayload | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  try {
    const url = new URL(trimmed);
    return fromPathname(url.pathname);
  } catch {
    const path = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
    return fromPathname(path);
  }
}
