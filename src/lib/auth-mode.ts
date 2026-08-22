/**
 * Customer sign-in mode. Default `pin` (SMS-free counter activation).
 * Set EXPO_PUBLIC_AUTH_MODE=otp when MSG91 / Twilio OTP is ready.
 */

export type AuthMode = 'otp' | 'pin';

export function readAuthMode(
  raw: string | undefined = process.env.EXPO_PUBLIC_AUTH_MODE,
): AuthMode {
  if (raw === 'otp' || raw === 'pin') {
    return raw;
  }
  return 'pin';
}

export const authMode: AuthMode = readAuthMode();
