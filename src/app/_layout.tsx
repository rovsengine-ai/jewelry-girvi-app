import '@/lib/notification-handler';
import { DarkTheme, DefaultTheme, ThemeProvider } from 'expo-router';
import { Stack, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { useColorScheme } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import { AppFrame } from '@/components/app-frame';
import { EnvBanner } from '@/components/env-banner';
import { OfflineBanner } from '@/components/offline-banner';
import { AuthProvider, routeForRole, useAuth } from '@/providers/auth-provider';
import { LanguageProvider } from '@/providers/language-provider';
import { NetworkProvider } from '@/providers/network-provider';

SplashScreen.preventAutoHideAsync();

function AuthGate({ children }: { children: React.ReactNode }) {
  const { session, profile, isLoading } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (isLoading) return;

    const inAuthGroup = segments[0] === '(auth)';
    // Typed routes may lag new screens; treat segments as strings for path checks.
    const routeSegments = segments as readonly string[];
    const onActivate = routeSegments.includes('activate');
    const onSignup = routeSegments.includes('signup');
    // Public QR deep links — must work signed-out (App Links + web).
    const onLoanQrLink = routeSegments.includes('g');
    const onActivationAppLink = routeSegments[0] === 'a';
    // Public Play Store / legal pages — must work signed-out on web.
    const onPrivacy = routeSegments[0] === 'privacy';
    const onDeleteAccount = routeSegments[0] === 'delete-account';

    if (!session) {
      if (
        !inAuthGroup &&
        !onLoanQrLink &&
        !onActivationAppLink &&
        !onPrivacy &&
        !onDeleteAccount
      ) {
        router.replace('/(auth)/login');
      }
      return;
    }

    if (inAuthGroup && !onActivate && !onSignup) {
      router.replace(routeForRole(profile?.role));
    }
  }, [session, profile, isLoading, segments, router]);

  return children;
}

export default function RootLayout() {
  const colorScheme = useColorScheme();

  return (
    <GestureHandlerRootView style={{ flex: 1, height: '100%' }}>
      <AuthProvider>
        <LanguageProvider>
          <NetworkProvider>
            <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
              <AppFrame>
              <AnimatedSplashOverlay />
              <AuthGate>
                <EnvBanner />
                <OfflineBanner />
                <Stack screenOptions={{ headerShown: false }}>
                  <Stack.Screen name="index" />
                  <Stack.Screen name="(auth)" />
                  <Stack.Screen name="(admin)" />
                  <Stack.Screen name="(customer)" />
                  <Stack.Screen name="a/[token]" />
                  <Stack.Screen name="privacy" />
                  <Stack.Screen name="delete-account" />
                </Stack>
              </AuthGate>
              </AppFrame>
            </ThemeProvider>
          </NetworkProvider>
        </LanguageProvider>
      </AuthProvider>
    </GestureHandlerRootView>
  );
}
