import { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { Stack, useRouter, useSegments } from 'expo-router';

import { useReduceMotion } from '@/hooks/use-reduce-motion';
import { stackMotionOptions } from '@/lib/motion';
import { ADMIN_LOANS_HREF, isArchiveRoute, isShopOwner } from '@/lib/shop-tab-access';
import { routeForRole, useAuth } from '@/providers/auth-provider';

function isShopRole(role: string | undefined): boolean {
  return role === 'owner' || role === 'staff';
}

/**
 * Role gate stays on this Stack. Tabs live under `shop/(tabs)` so URLs are
 * `/shop/loans` (customer tabs stay at `/loans`). Scanner, loan/[id], kyc,
 * and archive push as siblings ABOVE the tabs (WhatsApp model).
 * Archive is owner-only: staff who type the URL are replaced here. Hiding the
 * Settings link is not a permission. `Stack.Protected` is in the v57 docs but
 * not in expo-router@57.0.12, so this uses `useSegments`.
 * https://docs.expo.dev/versions/v57.0.0/sdk/router/
 * https://docs.expo.dev/router/advanced/tabs/
 * https://docs.expo.dev/router/advanced/nesting-navigators/
 */
export default function AdminLayout() {
  const { profile, isLoading, session } = useAuth();
  const router = useRouter();
  const segments = useSegments();
  const reduceMotion = useReduceMotion();
  const waitingForProfile = Boolean(session) && !profile;
  const pushMotion = stackMotionOptions(reduceMotion);
  const archiveBlocked = isArchiveRoute(segments) && !isShopOwner(profile?.role);

  useEffect(() => {
    if (isLoading || waitingForProfile) return;
    if (!session || !isShopRole(profile?.role)) {
      router.replace(routeForRole(profile?.role));
      return;
    }
    if (archiveBlocked) {
      router.replace(ADMIN_LOANS_HREF);
    }
  }, [session, profile, isLoading, waitingForProfile, archiveBlocked, router]);

  if (isLoading || waitingForProfile || !session || !isShopRole(profile?.role) || archiveBlocked) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="shop" />
      <Stack.Screen name="scanner" options={pushMotion} />
      <Stack.Screen name="loan/[id]" options={pushMotion} />
      <Stack.Screen name="kyc/[customerId]" options={pushMotion} />
      <Stack.Screen name="archive" options={pushMotion} />
    </Stack>
  );
}
