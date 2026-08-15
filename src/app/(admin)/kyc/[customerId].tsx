/**
 * DOC GATE (Expo SDK 57):
 * https://docs.expo.dev/versions/v57.0.0/sdk/router/
 * package: expo-router  last-modified: June 29, 2026
 *
 * Dynamic `[customerId]` matches the existing `(admin)/loan/[id]` file route.
 */
import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { EmptyState } from '@/components/empty-state';
import { KycCaptureForm } from '@/components/kyc-capture-form';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { fetchCustomerKyc, type CustomerKyc } from '@/services/kycService';

export default function KycCaptureScreen() {
  const { customerId } = useLocalSearchParams<{ customerId: string }>();
  const router = useRouter();
  const [customer, setCustomer] = useState<CustomerKyc | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!customerId) {
      setError('Missing customer id.');
      setIsLoading(false);
      return;
    }
    void (async () => {
      setIsLoading(true);
      try {
        setCustomer(await fetchCustomerKyc(customerId));
        setError(null);
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : 'Could not load KYC.');
      } finally {
        setIsLoading(false);
      }
    })();
  }, [customerId]);

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <Button label="← Back" variant="secondary" onPress={() => router.back()} />
        <ThemedText type="subtitle">KYC</ThemedText>
        {isLoading ? (
          <ActivityIndicator />
        ) : error || !customer ? (
          <EmptyState title="Could not load KYC" body={error ?? 'Customer not found.'} />
        ) : (
          <ScrollView contentContainerStyle={styles.content}>
            <KycCaptureForm customer={customer} />
          </ScrollView>
        )}
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1, paddingHorizontal: Spacing.four, gap: Spacing.two },
  content: { paddingBottom: Spacing.five, gap: Spacing.two },
});
