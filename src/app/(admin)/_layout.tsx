import { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';

import { routeForRole, useAuth } from '@/providers/auth-provider';

function isShopRole(role: string | undefined): boolean {
  return role === 'owner' || role === 'staff';
}

export default function AdminLayout() {
  const { profile, isLoading, session } = useAuth();
  const router = useRouter();
  const waitingForProfile = Boolean(session) && !profile;

  useEffect(() => {
    if (isLoading || waitingForProfile) return;
    if (!session || !isShopRole(profile?.role)) {
      router.replace(routeForRole(profile?.role));
    }
  }, [session, profile, isLoading, waitingForProfile, router]);

  if (isLoading || waitingForProfile || !session || !isShopRole(profile?.role)) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="dashboard" />
      <Stack.Screen name="scanner" />
      <Stack.Screen name="loan/[id]" />
      <Stack.Screen name="kyc/[customerId]" />
    </Stack>
  );
}
