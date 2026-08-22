import 'react-native-url-polyfill/auto';

import { createClient } from '@supabase/supabase-js';
import Constants from 'expo-constants';
import { AppState } from 'react-native';

import { sessionStorageAdapter } from '@/lib/session-storage';
import type { Database } from '@/types/supabase';

export type AppEnv = 'development' | 'production';

/**
 * Prefer Constants.expoConfig.extra.appEnv (set in app.config.ts from
 * EXPO_PUBLIC_ENV). Fall back to process.env for Jest / missing manifest.
 * https://docs.expo.dev/versions/v57.0.0/sdk/constants/
 */
function readAppEnv(): AppEnv {
  const fromConstants = Constants.expoConfig?.extra?.appEnv;
  const raw =
    typeof fromConstants === 'string' && fromConstants.length > 0
      ? fromConstants
      : (process.env.EXPO_PUBLIC_ENV ?? 'development');

  if (raw === 'development' || raw === 'production') {
    return raw;
  }

  throw new Error(
    `EXPO_PUBLIC_ENV must be "development" or "production" (got ${JSON.stringify(raw)})`,
  );
}

export const appEnv: AppEnv = readAppEnv();

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

function assertProductionNotLocalhost(env: AppEnv, url: string): void {
  if (env !== 'production') {
    return;
  }

  let hostname = '';
  try {
    hostname = new URL(url).hostname;
  } catch {
    throw new Error(
      `EXPO_PUBLIC_ENV is production but EXPO_PUBLIC_SUPABASE_URL is not a valid URL: ${JSON.stringify(url)}`,
    );
  }

  if (hostname === '127.0.0.1' || hostname === 'localhost') {
    throw new Error(
      'EXPO_PUBLIC_ENV is production but EXPO_PUBLIC_SUPABASE_URL points at localhost/127.0.0.1. Refusing to start — use the hosted project URL.',
    );
  }
}

assertProductionNotLocalhost(appEnv, supabaseUrl);

/** Hostname (and port if present) for the non-production env banner. */
export function getSupabaseHost(): string {
  if (!supabaseUrl) {
    return '(missing EXPO_PUBLIC_SUPABASE_URL)';
  }
  try {
    return new URL(supabaseUrl).host;
  } catch {
    return '(invalid EXPO_PUBLIC_SUPABASE_URL)';
  }
}

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  auth: {
    // Native: SecureStore. Web: localStorage (session-storage.web.ts).
    // https://docs.expo.dev/versions/v57.0.0/sdk/securestore/
    storage: sessionStorageAdapter,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

AppState.addEventListener('change', (state) => {
  if (state === 'active') {
    void supabase.auth.startAutoRefresh();
  } else {
    void supabase.auth.stopAutoRefresh();
  }
});
