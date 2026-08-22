import { Platform } from 'react-native';

import { getNativeExpoPushRegistration } from '@/lib/push-token';
import { supabase } from '@/lib/supabase';

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
 * Idempotent on (loan_id, notice_type, scheduled_for) and push_sent_at latch.
 */
export async function generateLoanNoticesAndPush(asOf?: string): Promise<{
  inserted: number;
  claimed: number;
  pushMessages: number;
}> {
  const { data, error } = await supabase.functions.invoke('send-loan-notice-push', {
    body: asOf ? { as_of: asOf } : {},
  });

  if (error) {
    throw new Error(error.message);
  }

  const body = data as {
    inserted?: number;
    claimed?: number;
    push_messages?: number;
    error?: string;
  };

  if (body?.error) {
    throw new Error(body.error);
  }

  return {
    inserted: typeof body?.inserted === 'number' ? body.inserted : 0,
    claimed: typeof body?.claimed === 'number' ? body.claimed : 0,
    pushMessages: typeof body?.push_messages === 'number' ? body.push_messages : 0,
  };
}
