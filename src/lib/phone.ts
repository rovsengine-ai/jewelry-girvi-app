/**
 * Canonical Indian mobile E.164: +91XXXXXXXXXX
 * Used for OTP login, profile.phone_number, and admin customer lookup.
 */
export function toE164India(phone: string): string {
  const digits = phone.replace(/\D/g, '');

  if (digits.startsWith('91') && digits.length === 12) {
    return `+${digits}`;
  }

  const national = digits.length === 11 && digits.startsWith('0') ? digits.slice(1) : digits;

  if (national.length === 10) {
    return `+91${national}`;
  }

  if (digits.length === 0) {
    throw new Error('Phone number is required.');
  }

  return phone.startsWith('+') ? `+${digits}` : `+${digits}`;
}

/** Dialer URL for a stored shop phone. Null when the number cannot be parsed. */
export function telHref(phone: string | null | undefined): string | null {
  if (phone == null || phone.trim() === '') return null;
  try {
    return `tel:${toE164India(phone)}`;
  } catch {
    return null;
  }
}
