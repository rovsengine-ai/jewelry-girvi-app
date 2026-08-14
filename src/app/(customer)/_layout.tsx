import { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';

import { routeForRole, useAuth } from '@/providers/auth-provider';
import { fetchCustomerLoanReminders } from '@/services/loanService';
import { syncLoanReminderNotifications } from '@/services/loanReminderNotifications';

function isCustomerRole(role: string | undefined): boolean {
  return role === 'retail_customer' || role === 'merchant';
}

export default function CustomerLayout() {
  const { profile, isLoading, session } = useAuth();
  const router = useRouter();
  const waitingForProfile = Boolean(session) && !profile;

  useEffect(() => {
    if (isLoading || waitingForProfile) return;
    if (!session) {
      router.replace('/(auth)/login');
      return;
    }
    if (!isCustomerRole(profile?.role)) {
      router.replace(routeForRole(profile?.role));
    }
  }, [session, profile, isLoading, waitingForProfile, router]);

  useEffect(() => {
    if (!session || !isCustomerRole(profile?.role)) return;
    let cancelled = false;
    void (async () => {
      try {
        const slots = await fetchCustomerLoanReminders();
        if (!cancelled) {
          await syncLoanReminderNotifications(slots);
        }
      } catch (err) {
        console.warn(err instanceof Error ? err.message : err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [session, profile?.role]);

  if (isLoading || waitingForProfile || !session || !isCustomerRole(profile?.role)) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="dashboard" />
    </Stack>
  );
}
