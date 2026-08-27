import type { ConfigContext, ExpoConfig } from 'expo/config';

/**
 * Embeds EXPO_PUBLIC_ENV into Constants.expoConfig.extra so runtime code can
 * read the environment via expo-constants (see src/lib/supabase.ts).
 * Android App Links intentFilters use EXPO_PUBLIC_WEB_ORIGIN host.
 * https://docs.expo.dev/versions/v57.0.0/sdk/constants/
 * https://docs.expo.dev/workflow/configuration/
 * https://docs.expo.dev/linking/android-app-links/
 */

function webOriginHost(raw: string | undefined): string | undefined {
  const trimmed = (raw ?? '').trim();
  if (!trimmed) return undefined;
  try {
    return new URL(trimmed).host;
  } catch {
    return undefined;
  }
}

export default ({ config }: ConfigContext): ExpoConfig => {
  const appEnv = process.env.EXPO_PUBLIC_ENV ?? 'development';
  const authMode = process.env.EXPO_PUBLIC_AUTH_MODE ?? 'pin';
  const linkHost = webOriginHost(process.env.EXPO_PUBLIC_WEB_ORIGIN);

  const androidIntentFilters = linkHost
    ? [
        {
          action: 'VIEW' as const,
          autoVerify: true,
          data: [
            { scheme: 'https' as const, host: linkHost, pathPrefix: '/g' },
            { scheme: 'https' as const, host: linkHost, pathPrefix: '/a' },
          ],
          category: ['BROWSABLE' as const, 'DEFAULT' as const],
        },
      ]
    : undefined;

  return {
    ...config,
    name: config.name ?? 'GIRVI SEWA',
    slug: config.slug ?? 'jewelry-girvi-app',
    android: {
      ...config.android,
      ...(androidIntentFilters ? { intentFilters: androidIntentFilters } : {}),
    },
    extra: {
      ...config.extra,
      appEnv,
      authMode,
    },
  };
};
