import { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { Stack, useRouter, useSegments } from 'expo-router';

import { useReduceMotion } from '@/hooks/use-reduce-motion';
import { stackMotionOptions } from '@/lib/motion';
import { routeForRole, useAuth } from '@/providers/auth-provider';
import { fetchCustomerLoanReminders } from '@/services/loanService';
import { syncLoanReminderNotifications } from '@/services/loanReminderNotifications';
import { profileHasPushToken, registerOwnExpoPushToken } from '@/services/pushTokenService';

function isCustomerRole(role: string | undefined): boolean {
  return role === 'retail_customer' || role === 'merchant';
}

/**
 * Role gate and reminder sync stay here. Tabs live in `(tabs)`.
 * `/g/[token]` is public (signed-out receipt landing) — do not bounce to login.
 * Prefer Expo remote push when a token is registered; local OS reminders are the
 * offline fallback only (never both for the same due/overdue cycle).
 * https://docs.expo.dev/router/advanced/tabs/
 * https://docs.expo.dev/router/advanced/nesting-navigators/
 * https://docs.expo.dev/versions/v57.0.0/sdk/notifications/
 */
export default function CustomerLayout() {
  const { profile, isLoading, session } = useAuth();
  const router = useRouter();
  const segments = useSegments();
  const reduceMotion = useReduceMotion();
  const waitingForProfile = Boolean(session) && !profile;
  const routeSegments = segments as readonly string[];
  const onLoanQrLanding = routeSegments.includes('g');

  useEffect(() => {
    if (isLoading || waitingForProfile) return;
    if (!session) {
      if (!onLoanQrLanding) {
        router.replace('/(auth)/login');
      }
      return;
    }
    if (!isCustomerRole(profile?.role)) {
      router.replace(routeForRole(profile?.role));
    }
  }, [session, profile, isLoading, waitingForProfile, onLoanQrLanding, router]);

  useEffect(() => {
    if (!session || !isCustomerRole(profile?.role)) return;
    let cancelled = false;
    void (async () => {
      try {
        try {
          await registerOwnExpoPushToken();
        } catch (err) {
          console.warn(err instanceof Error ? err.message : err);
        }
        const preferRemotePush = await profileHasPushToken().catch(() => false);
        const slots = await fetchCustomerLoanReminders();
        if (!cancelled) {
          await syncLoanReminderNotifications(slots, Date.now(), { preferRemotePush });
        }
      } catch (err) {
        console.warn(err instanceof Error ? err.message : err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [session, profile?.role]);

  if (isLoading || waitingForProfile) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator />
      </View>
    );
  }

  if (!session && onLoanQrLanding) {
    return (
      <Stack screenOptions={{ headerShown: false, ...stackMotionOptions(reduceMotion) }}>
        <Stack.Screen name="g/[token]" />
      </Stack>
    );
  }

  if (!session || !isCustomerRole(profile?.role)) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <Stack screenOptions={{ headerShown: false, ...stackMotionOptions(reduceMotion) }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="g/[token]" />
    </Stack>
  );
}
