import { Platform } from 'react-native';

import { readEdgeFunctionErrorBody, requireUserAccessToken } from '@/lib/edge-invoke';
import { getNativeExpoPushRegistration } from '@/lib/push-token';
import { supabase } from '@/lib/supabase';
import { generateLoanNotices } from '@/services/loanService';

/** True when this profile has at least one native Expo push token (RLS: own rows). */
export async function profileHasPushToken(): Promise<boolean> {
  const { count, error } = await supabase
    .from('profile_push_tokens')
    .select('id', { count: 'exact', head: true });

  if (error) {
    throw new Error(error.message);
  }

  return (count ?? 0) > 0;
}

/**
 * Register this device's Expo push token for the signed-in profile.
 * No-op on web / missing permission / Expo Go limitations.
 */
export async function registerOwnExpoPushToken(): Promise<boolean> {
  if (Platform.OS !== 'ios' && Platform.OS !== 'android') {
    return false;
  }

  const registration = await getNativeExpoPushRegistration();
  if (!registration) {
    return false;
  }

  const { error } = await supabase.rpc('upsert_own_push_token', {
    p_expo_push_token: registration.token,
    p_platform: registration.platform,
  });

  if (error) {
    throw new Error(error.message);
  }

  return true;
}

/**
 * Shop: generate in-app notices then claim + send Expo pushes (edge function).
 * Falls back to RPC-only generation when the edge function is unavailable.
 */
export async function generateLoanNoticesAndPush(asOf?: string): Promise<{
  inserted: number;
  claimed: number;
  pushMessages: number;
}> {
  try {
    await requireUserAccessToken();
    const { data, error } = await supabase.functions.invoke('send-loan-notice-push', {
      body: asOf ? { as_of: asOf } : {},
    });

    if (error) {
      const body = await readEdgeFunctionErrorBody(error);
      throw new Error(body?.error ?? body?.message ?? error.message);
    }

    const payload = data as {
      inserted?: number;
      claimed?: number;
      push_messages?: number;
      error?: string;
    };

    if (payload?.error) {
      throw new Error(payload.error);
    }

    return {
      inserted: typeof payload?.inserted === 'number' ? payload.inserted : 0,
      claimed: typeof payload?.claimed === 'number' ? payload.claimed : 0,
      pushMessages: typeof payload?.push_messages === 'number' ? payload.push_messages : 0,
    };
  } catch {
    const inserted = await generateLoanNotices(asOf);
    return { inserted, claimed: 0, pushMessages: 0 };
  }
}
