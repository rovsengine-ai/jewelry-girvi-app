import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Badge } from '@/components/badge';
import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { EmptyState } from '@/components/empty-state';
import { FormNotice } from '@/components/form-notice';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Radii, Spacing, TypeScale } from '@/constants/theme';
import { noticeTypeLabel } from '@/lib/notices';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/providers/auth-provider';
import { fetchLoanNotices, resolveReceiptDisplayUrl } from '@/services/loanService';
import type { Loan, LoanNotice } from '@/types/database';

type CustomerLoanView = Pick<Loan, 'id' | 'receipt_image_url' | 'status'> & {
  displayUrl?: string | null;
};

export default function CustomerDashboardScreen() {
  const { session, signOut } = useAuth();

  const [loans, setLoans] = useState<CustomerLoanView[]>([]);
  const [notices, setNotices] = useState<LoanNotice[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const loadLoans = useCallback(async () => {
    if (!session?.user.id) return;

    const { data, error } = await supabase
      .from('loans')
      .select('id, receipt_image_url, status')
      .eq('customer_id', session.user.id)
      .order('created_at', { ascending: false });

    if (error) {
      throw new Error(error.message);
    }

    const rows = (data ?? []) as CustomerLoanView[];
    const withUrls = await Promise.all(
      rows.map(async (row) => ({
        ...row,
        displayUrl: await resolveReceiptDisplayUrl(row.receipt_image_url).catch(() => null),
      })),
    );
    setLoans(withUrls);

    try {
      setNotices(await fetchLoanNotices(20));
    } catch {
      setNotices([]);
    }
  }, [session?.user.id]);

  const refresh = useCallback(async () => {
    setIsRefreshing(true);
    setLoadError(null);
    try {
      await loadLoans();
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Could not load receipts.');
    } finally {
      setIsRefreshing(false);
    }
  }, [loadLoans]);

  useEffect(() => {
    void (async () => {
      setIsLoading(true);
      setLoadError(null);
      try {
        await loadLoans();
      } catch (error) {
        setLoadError(error instanceof Error ? error.message : 'Could not load receipts.');
      } finally {
        setIsLoading(false);
      }
    })();
  }, [loadLoans]);

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.header}>
          <ThemedText style={TypeScale.display}>My Receipts</ThemedText>
          <Button label="Sign out" variant="secondary" onPress={() => void signOut()} />
        </View>

        <ThemedText type="small" themeColor="textSecondary">
          Only your own receipts, loan status, and due-date notices are shown here. Payment
          reminders (15 days before due, due day, and overdue) use this phone's notifications after
          you allow them.
        </ThemedText>

        <FormNotice error={loadError} />

        {notices.length > 0 ? (
          <Card>
            {notices.map((notice) => (
              <ThemedText type="small" key={notice.id}>
                {noticeTypeLabel(notice.notice_type)} · {notice.scheduled_for}
              </ThemedText>
            ))}
          </Card>
        ) : null}

        {isLoading ? (
          <ActivityIndicator style={styles.loader} />
        ) : (
          <FlatList
            data={loans}
            keyExtractor={(item) => item.id}
            refreshControl={
              <RefreshControl refreshing={isRefreshing} onRefresh={() => void refresh()} />
            }
            contentContainerStyle={styles.listContent}
            ListEmptyComponent={
              <EmptyState
                title="No receipts yet"
                body="No girvi receipts linked to your account yet."
              />
            }
            renderItem={({ item }) => (
              <Card style={styles.card}>
                {item.displayUrl ? (
                  <Image
                    source={{ uri: item.displayUrl }}
                    style={styles.receiptImage}
                    contentFit="cover"
                  />
                ) : (
                  <View style={styles.receiptPlaceholder}>
                    <ThemedText type="small">No receipt image</ThemedText>
                  </View>
                )}
                <View style={styles.badgeWrap}>
                  <Badge status={item.status} />
                </View>
              </Card>
            )}
          />
        )}
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1, paddingHorizontal: Spacing.four, gap: Spacing.two },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  loader: { marginTop: Spacing.five },
  listContent: { gap: Spacing.three, paddingBottom: Spacing.five },
  card: { overflow: 'hidden', padding: 0 },
  receiptImage: { width: '100%', height: 220, borderRadius: Radii.md },
  receiptPlaceholder: {
    height: 160,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeWrap: {
    position: 'absolute',
    top: Spacing.two,
    right: Spacing.two,
  },
});
