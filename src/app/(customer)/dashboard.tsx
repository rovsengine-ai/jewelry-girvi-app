import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/providers/auth-provider';
import type { Loan } from '@/types/database';

type CustomerLoanView = Pick<Loan, 'id' | 'receipt_image_url' | 'status'>;

function StatusBadge({ status }: { status: string }) {
  const isActive = status === 'active';
  return (
    <View style={[styles.badge, { backgroundColor: isActive ? '#1B7F3A' : '#6B7280' }]}>
      <ThemedText type="smallBold" style={styles.badgeText}>
        {isActive ? 'Active' : 'Closed'}
      </ThemedText>
    </View>
  );
}

export default function CustomerDashboardScreen() {
  const colors = useTheme();
  const { session, signOut } = useAuth();

  const [loans, setLoans] = useState<CustomerLoanView[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const loadLoans = useCallback(async () => {
    if (!session?.user.id) return;

    const { data, error } = await supabase
      .from('loans')
      .select('id, receipt_image_url, status')
      .eq('customer_id', session.user.id)
      .order('created_at', { ascending: false });

    if (error) {
      console.warn(error.message);
      return;
    }

    setLoans((data ?? []) as CustomerLoanView[]);
  }, [session?.user.id]);

  const refresh = useCallback(async () => {
    setIsRefreshing(true);
    await loadLoans();
    setIsRefreshing(false);
  }, [loadLoans]);

  useEffect(() => {
    void (async () => {
      setIsLoading(true);
      await loadLoans();
      setIsLoading(false);
    })();
  }, [loadLoans]);

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.header}>
          <ThemedText type="title">My Receipts</ThemedText>
          <Pressable onPress={() => void signOut()} style={styles.signOut}>
            <ThemedText type="smallBold">Sign out</ThemedText>
          </Pressable>
        </View>

        <ThemedText style={styles.privacyNote}>
          For your privacy, only your physical receipt image and loan status are shown here.
        </ThemedText>

        {isLoading ? (
          <ActivityIndicator style={styles.loader} />
        ) : (
          <FlatList
            data={loans}
            keyExtractor={(item) => item.id}
            refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={() => void refresh()} />}
            contentContainerStyle={styles.listContent}
            ListEmptyComponent={
              <ThemedText style={styles.empty}>No girvi receipts linked to your account yet.</ThemedText>
            }
            renderItem={({ item }) => (
              <View style={[styles.card, { backgroundColor: colors.backgroundElement }]}>
                {item.receipt_image_url ? (
                  <Image
                    source={{ uri: item.receipt_image_url }}
                    style={styles.receiptImage}
                    contentFit="cover"
                  />
                ) : (
                  <View style={[styles.receiptPlaceholder, { backgroundColor: colors.backgroundSelected }]}>
                    <ThemedText type="small">No receipt image</ThemedText>
                  </View>
                )}
                <StatusBadge status={item.status} />
              </View>
            )}
          />
        )}
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.three,
  },
  signOut: { padding: Spacing.two },
  privacyNote: {
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.two,
    opacity: 0.75,
  },
  loader: { marginTop: Spacing.five },
  listContent: { padding: Spacing.four, gap: Spacing.three },
  card: { borderRadius: 16, overflow: 'hidden', gap: Spacing.two, padding: Spacing.two },
  receiptImage: { width: '100%', height: 220, borderRadius: 12 },
  receiptPlaceholder: {
    width: '100%',
    height: 220,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one,
  },
  badgeText: { color: '#fff' },
  empty: { textAlign: 'center', opacity: 0.7, marginTop: Spacing.five },
});
