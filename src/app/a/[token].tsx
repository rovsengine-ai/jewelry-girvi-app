/**
 * App Link path for activation QR: https://<origin>/a/<login_token>
 * Forwards the token to the existing activate screen (query param).
 * Linking: https://docs.expo.dev/versions/v57.0.0/sdk/linking/
 * Android App Links: https://docs.expo.dev/linking/android-app-links/
 */
import { Redirect, useLocalSearchParams, type Href } from 'expo-router';

function firstParam(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

export default function ActivationAppLinkScreen() {
  const { token: tokenParam } = useLocalSearchParams<{ token?: string | string[] }>();
  const token = firstParam(tokenParam)?.trim() ?? '';

  const href = (
    token.length > 0 ? `/activate?token=${encodeURIComponent(token)}` : '/activate'
  ) as Href;

  return <Redirect href={href} />;
}
