/**
 * DOC GATE (Expo SDK 57):
 * https://docs.expo.dev/versions/v57.0.0/sdk/router/
 * package: expo-router  last-modified: June 29, 2026
 *
 * Dynamic `[customerId]` matches the existing `(admin)/loan/[id]` file route.
 */
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet } from 'react-native';

import { Button } from '@/components/button';
import { EmptyState } from '@/components/empty-state';
import { KycCaptureForm } from '@/components/kyc-capture-form';
import { ListSkeleton } from '@/components/list-row-skeleton';
import { ScreenHeader } from '@/components/screen-header';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useLanguage } from '@/providers/language-provider';
import { fetchCustomerKyc, type CustomerKyc } from '@/services/kycService';

export default function KycCaptureScreen() {
  const { customerId } = useLocalSearchParams<{ customerId: string }>();
  const router = useRouter();
  const { t } = useLanguage();
  const [customer, setCustomer] = useState<CustomerKyc | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!customerId) {
      setError(t('kyc.missingCustomerId'));
      setIsLoading(false);
      return;
    }
    void (async () => {
      setIsLoading(true);
      try {
        setCustomer(await fetchCustomerKyc(customerId));
        setError(null);
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : t('kyc.loadErrorBody'));
      } finally {
        setIsLoading(false);
      }
    })();
  }, [customerId, t]);

  return (
    <ThemedView style={styles.container}>
      <ScreenHeader showBack title={t('kyc.title')} />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.body}>
        <Button label={t('common.back')} variant="secondary" onPress={() => router.back()} />
        {isLoading ? (
          <ListSkeleton rows={6} />
        ) : error || !customer ? (
          <EmptyState title={t('kyc.loadErrorTitle')} body={error ?? t('kyc.customerNotFound')} />
        ) : (
          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.content}>
            <KycCaptureForm customer={customer} />
          </ScrollView>
        )}
      </KeyboardAvoidingView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  body: { flex: 1, paddingHorizontal: Spacing.four, gap: Spacing.two },
  content: { paddingBottom: Spacing.five, gap: Spacing.two },
});
