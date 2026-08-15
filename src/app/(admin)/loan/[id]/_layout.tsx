import { Stack } from 'expo-router';

import { useReduceMotion } from '@/hooks/use-reduce-motion';
import { stackMotionOptions } from '@/lib/motion';

/**
 * Nested stack under /loan/[id]. Expo Router notation (docs.expo.dev/router/basics/notation,
 * modified 2026-02-26): a directory `[id]` with `index.tsx` is `/loan/:id`, and
 * sibling files become `/loan/:id/redeem` and `/loan/:id/renew`.
 *
 * A dedicated screen, not a modal: redemption is a multi-step checklist
 * (balances → payment → item release → collector name) that needs its own
 * back stack so dismissing it cannot skip the RPC.
 */
export default function LoanIdLayout() {
  const reduceMotion = useReduceMotion();
  const pushMotion = stackMotionOptions(reduceMotion);

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="redeem" options={pushMotion} />
      <Stack.Screen name="renew" options={pushMotion} />
      <Stack.Screen name="default" options={pushMotion} />
      <Stack.Screen name="terms" options={pushMotion} />
    </Stack>
  );
}
