import { Stack } from 'expo-router';

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
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="redeem" />
      <Stack.Screen name="renew" />
    </Stack>
  );
}
