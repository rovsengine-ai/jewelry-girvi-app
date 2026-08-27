/**
 * Path prefix so shop tabs are /shop/loans (not /loans).
 * Scanner is a stack sibling of the tabs so plus/scan can push
 * /(admin)/shop/scanner instead of leaving the shop navigator.
 * https://docs.expo.dev/router/advanced/nesting-navigators/
 */
import { Stack } from 'expo-router';

import { useReduceMotion } from '@/hooks/use-reduce-motion';
import { stackMotionOptions } from '@/lib/motion';

export const unstable_settings = {
  initialRouteName: '(tabs)',
};

export default function ShopPathLayout() {
  const reduceMotion = useReduceMotion();

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="scanner" options={stackMotionOptions(reduceMotion)} />
    </Stack>
  );
}
