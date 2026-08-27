/**
 * Customer loan QR landing: /g/<public_token>
 * Signed out → masked serial (last 4) + sign-in. Signed in → own loan via RLS,
 * else neutral not-found. Never amount/name/items/dates.
 *
 * Expo Router (SDK 57): https://docs.expo.dev/versions/v57.0.0/sdk/router/
 * Linking: https://docs.expo.dev/versions/v57.0.0/sdk/linking/
 */
import { Link, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { Card } from '@/components/card';
import { EmptyState } from '@/components/empty-state';
import { ScreenHeader } from '@/components/screen-header';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { CUSTOMER_LOANS_HREF, isShopUser } from '@/lib/shop-tab-access';
import { useAuth } from '@/providers/auth-provider';
import { useLanguage } from '@/providers/language-provider';
import {
  fetchLoanReceiptMaskByPublicToken,
  fetchOwnLoanIdByPublicToken,
} from '@/services/loanService';

function firstParam(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

type ViewState =
  | { kind: 'loading' }
  | { kind: 'signedOut'; serialLast4: string }
  | { kind: 'notFound' };

export default function CustomerLoanQrLandingScreen() {
  const { token: tokenParam } = useLocalSearchParams<{ token?: string | string[] }>();
  const token = firstParam(tokenParam)?.trim() ?? '';
  const { session, profile, isLoading: authLoading } = useAuth();
  const { t } = useLanguage();
  const router = useRouter();
  const [state, setState] = useState<ViewState>({ kind: 'loading' });

  useEffect(() => {
    if (authLoading) return;
    if (session && !profile) return;

    let cancelled = false;

    void (async () => {
      if (!token) {
        if (!cancelled) setState({ kind: 'notFound' });
        return;
      }

      if (!session) {
        try {
          const serialLast4 = await fetchLoanReceiptMaskByPublicToken(token);
          if (cancelled) return;
          if (!serialLast4) {
            setState({ kind: 'notFound' });
            return;
          }
          setState({ kind: 'signedOut', serialLast4 });
        } catch {
          if (!cancelled) setState({ kind: 'notFound' });
        }
        return;
      }

      try {
        const loanId = await fetchOwnLoanIdByPublicToken(token);
        if (cancelled) return;
        if (loanId) {
          if (isShopUser(profile?.role)) {
            router.replace(`/(admin)/loan/${loanId}`);
            return;
          }
          router.replace(CUSTOMER_LOANS_HREF);
          return;
        }
        setState({ kind: 'notFound' });
      } catch {
        if (!cancelled) setState({ kind: 'notFound' });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [authLoading, session, profile, token, router]);

  if (state.kind === 'loading') {
    return (
      <ThemedView style={styles.centered}>
        <ActivityIndicator />
      </ThemedView>
    );
  }

  if (state.kind === 'notFound') {
    return (
      <ThemedView style={styles.container}>
        <ScreenHeader title={t('loanQrLanding.title')} />
        <EmptyState
          title={t('loanQrLanding.notFoundTitle')}
          body={t('loanQrLanding.notFoundBody')}
        />
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <ScreenHeader title={t('loanQrLanding.title')} subtitle={t('loanQrLanding.subtitle')} />
      <View style={styles.body}>
        <Card>
          <ThemedText type="title" testID="loan-qr-masked-serial">
            {t('loanQrLanding.maskedReference', { last4: state.serialLast4 })}
          </ThemedText>
          <ThemedText type="bodyLarge" style={styles.gap}>
            {t('loanQrLanding.signInPrompt')}
          </ThemedText>
          <Link href="/(auth)/login" style={styles.gap} testID="loan-qr-sign-in">
            <ThemedText type="linkPrimary">{t('loanQrLanding.signIn')}</ThemedText>
          </Link>
        </Card>
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: {
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.two,
  },
  gap: {
    marginTop: Spacing.two,
  },
});
