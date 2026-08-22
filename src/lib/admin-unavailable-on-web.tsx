/**
 * Shop (admin) UI is native-only. Expo Router requires a non-platform sibling
 * for every platform-specific route file, so each admin *.web.tsx re-exports
 * this redirect instead of shipping scanner / redeem / archive screens.
 * https://docs.expo.dev/router/advanced/platform-specific-modules/
 */
import { Redirect } from 'expo-router';

export default function AdminUnavailableOnWeb() {
  return <Redirect href="/(auth)/login" />;
}
