import { readAuthMode } from '@/lib/auth-mode';

describe('readAuthMode', () => {
  it('defaults to pin when unset or unknown', () => {
    expect(readAuthMode(undefined)).toBe('pin');
    expect(readAuthMode('')).toBe('pin');
    expect(readAuthMode('sms')).toBe('pin');
  });

  it('accepts otp and pin', () => {
    expect(readAuthMode('otp')).toBe('otp');
    expect(readAuthMode('pin')).toBe('pin');
  });
});
