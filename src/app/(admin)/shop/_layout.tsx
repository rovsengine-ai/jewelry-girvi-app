/**
 * Path prefix so shop tabs are /shop/loans (not /loans).
 * Scanner is a stack sibling of the tabs so plus/scan can push /shop/scanner
 * instead of leaving the shop navigator (blank page on web).
 * https://docs.expo.dev/router/advanced/nesting-navigators/
 */
import { Stack } from 'expo-router';
import { Platform } from 'react-native';

import { useReduceMotion } from '@/hooks/use-reduce-motion';
import { stackMotionOptions } from '@/lib/motion';

export const unstable_settings = {
  initialRouteName: '(tabs)',
};

export default function ShopPathLayout() {
  const reduceMotion = useReduceMotion();
  const pushMotion =
    Platform.OS === 'web' ? { animation: 'none' as const } : stackMotionOptions(reduceMotion);

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="scanner" options={pushMotion} />
    </Stack>
  );
}
