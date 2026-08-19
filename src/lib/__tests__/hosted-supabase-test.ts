import { assertSupabasePublicConfig } from '@/lib/hosted-supabase';

describe('assertSupabasePublicConfig', () => {
  const hosted = 'https://example.supabase.co';
  const anon = 'anon-key';

  test('accepts a hosted https URL in production', () => {
    expect(() =>
      assertSupabasePublicConfig(hosted, anon, { isDev: false }),
    ).not.toThrow();
  });

  test('accepts the local CLI URL while developing', () => {
    expect(() =>
      assertSupabasePublicConfig('http://127.0.0.1:54321', anon, { isDev: true }),
    ).not.toThrow();
  });

  test('rejects a missing URL or key', () => {
    expect(() => assertSupabasePublicConfig('', anon, { isDev: false })).toThrow(
      /Missing EXPO_PUBLIC_SUPABASE/,
    );
    expect(() => assertSupabasePublicConfig(hosted, '', { isDev: false })).toThrow(
      /Missing EXPO_PUBLIC_SUPABASE/,
    );
  });

  test('rejects localhost and http in production store builds', () => {
    expect(() =>
      assertSupabasePublicConfig('http://127.0.0.1:54321', anon, { isDev: false }),
    ).toThrow(/https:\/\//);
    expect(() =>
      assertSupabasePublicConfig('https://127.0.0.1:54321', anon, { isDev: false }),
    ).toThrow(/local Supabase/);
    expect(() =>
      assertSupabasePublicConfig('https://db.local', anon, { isDev: false }),
    ).toThrow(/local Supabase/);
    expect(() =>
      assertSupabasePublicConfig('not-a-url', anon, { isDev: false }),
    ).toThrow(/not a valid URL/);
    expect(() => assertSupabasePublicConfig('  ', anon, { isDev: false })).toThrow(
      /Missing EXPO_PUBLIC_SUPABASE/,
    );
    expect(() => assertSupabasePublicConfig(hosted, '  ', { isDev: false })).toThrow(
      /Missing EXPO_PUBLIC_SUPABASE/,
    );
  });
});
