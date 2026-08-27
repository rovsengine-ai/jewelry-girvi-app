import { activationLandingUrl, loanLandingUrl, readWebOrigin } from '@/lib/web-origin';

describe('web-origin QR payloads', () => {
  const previous = process.env.EXPO_PUBLIC_WEB_ORIGIN;

  afterEach(() => {
    process.env.EXPO_PUBLIC_WEB_ORIGIN = previous;
  });

  test('strips trailing slashes and builds /g and /a URLs from the opaque token only', () => {
    process.env.EXPO_PUBLIC_WEB_ORIGIN = 'https://girvi.example/';
    expect(readWebOrigin()).toBe('https://girvi.example');
    expect(loanLandingUrl('tok_loan_abc')).toBe('https://girvi.example/g/tok_loan_abc');
    expect(activationLandingUrl('tok_act_xyz')).toBe('https://girvi.example/a/tok_act_xyz');
  });

  test('percent-encodes token characters that are not URL-safe', () => {
    process.env.EXPO_PUBLIC_WEB_ORIGIN = 'https://girvi.example';
    expect(loanLandingUrl('ab/c')).toBe('https://girvi.example/g/ab%2Fc');
  });

  test('refuses to build URLs when EXPO_PUBLIC_WEB_ORIGIN is missing', () => {
    delete process.env.EXPO_PUBLIC_WEB_ORIGIN;
    expect(() => readWebOrigin()).toThrow(/EXPO_PUBLIC_WEB_ORIGIN/);
  });

  test('maps the retired jewelry-girvi-app host to girvi-sewa', () => {
    process.env.EXPO_PUBLIC_WEB_ORIGIN = 'https://jewelry-girvi-app.vercel.app';
    expect(readWebOrigin()).toBe('https://girvi-sewa.vercel.app');
    expect(loanLandingUrl('tok')).toBe('https://girvi-sewa.vercel.app/g/tok');
  });
});
