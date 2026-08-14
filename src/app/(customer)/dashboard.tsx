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
import { loanStatusLabel } from '@/lib/redemption';
import { noticeTypeLabel } from '@/lib/notices';
import { formatPaiseAsInr } from '@/lib/money';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/providers/auth-provider';
import { fetchLoanNotices, resolveReceiptDisplayUrl } from '@/services/loanService';
import type { Loan, LoanNotice, LoanStatus } from '@/types/database';

type CustomerLoanView = Pick<Loan, 'id' | 'receipt_image_url' | 'status'> & {
  displayUrl?: string | null;
};

function StatusBadge({ status }: { status: LoanStatus }) {
  const backgroundColor =
    status === 'active' ? '#1B7F3A' : status === 'defaulted' ? '#B42318' : '#6B7280';
  return (
    <View style={[styles.badge, { backgroundColor }]}>
      <ThemedText type="smallBold" style={styles.badgeText}>
        {loanStatusLabel(status)}
      </ThemedText>
    </View>
  );
}

export default function CustomerDashboardScreen() {
  const colors = useTheme();
  const { session, signOut } = useAuth();

  const [loans, setLoans] = useState<CustomerLoanView[]>([]);
  const [notices, setNotices] = useState<LoanNotice[]>([]);
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
    } catch (err) {
      console.warn(err instanceof Error ? err.message : err);
    }
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
          Only your own receipts, loan status, and due-date notices are shown here.
          Payment reminders (15 days before due, due day, and overdue) use this phone's
          notifications after you allow them.
        </ThemedText>

        {notices.length > 0 ? (
          <View style={styles.noticeBlock}>
            {notices.map((notice) => {
              const duePaise = notice.payload.total_due_paise;
              const amount =
                typeof duePaise === 'number' && Number.isInteger(duePaise)
                  ? ` · ${formatPaiseAsInr(duePaise)}`
                  : '';
              return (
                <ThemedText type="small" key={notice.id}>
                  {noticeTypeLabel(notice.notice_type)} · {notice.scheduled_for}
                  {amount}
                </ThemedText>
              );
            })}
          </View>
        ) : null}

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
                {item.displayUrl ? (
                  <Image
                    source={{ uri: item.displayUrl }}
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
  safeArea: { flex: 1, paddingHorizontal: Spacing.four },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.two,
  },
  signOut: { padding: Spacing.two },
  privacyNote: { marginBottom: Spacing.three, opacity: 0.8 },
  noticeBlock: { marginBottom: Spacing.three, gap: Spacing.one },
  loader: { marginTop: Spacing.five },
  listContent: { gap: Spacing.three, paddingBottom: Spacing.five },
  empty: { textAlign: 'center', marginTop: Spacing.five },
  card: { borderRadius: 14, overflow: 'hidden' },
  receiptImage: { width: '100%', height: 220 },
  receiptPlaceholder: {
    height: 160,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    position: 'absolute',
    top: Spacing.two,
    right: Spacing.two,
    borderRadius: 8,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.one,
  },
  badgeText: { color: '#fff' },
});
