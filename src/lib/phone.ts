/**
 * Canonical Indian mobile E.164: +91XXXXXXXXXX
 * Used for OTP login, profile.phone_number, and admin customer lookup.
 */
export function toE164India(phone: string): string {
  const digits = phone.replace(/\D/g, '');

  if (digits.startsWith('91') && digits.length === 12) {
    return `+${digits}`;
  }

  if (digits.length === 10) {
    return `+91${digits}`;
  }

  if (digits.length === 0) {
    throw new Error('Phone number is required.');
  }

  return phone.startsWith('+') ? `+${digits}` : `+${digits}`;
}
