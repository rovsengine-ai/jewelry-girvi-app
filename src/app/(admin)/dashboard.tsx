import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  Share,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Link, useRouter } from 'expo-router';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { asBps, asPaise, formatBpsAsPercent, formatPaiseAsInr } from '@/lib/money';
import { buildOverdueCallListCsv, noticeTypeLabel } from '@/lib/notices';
import { loanStatusLabel } from '@/lib/redemption';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/providers/auth-provider';
import {
  fetchLoanNotices,
  fetchOverdueLoans,
  fetchRateYield,
  generateLoanNotices,
} from '@/services/loanService';
import type { LoanNotice, LoanStatus, LoanWithCustomer, OverdueLoan, RateYield } from '@/types/database';

type CustomerTab = 'retail_customer' | 'merchant';
type StatusFilter = 'active' | 'redeemed' | 'closed' | 'defaulted' | 'all';

function AnalyticsCard({ label, value }: { label: string; value: string }) {
  const colors = useTheme();

  return (
    <View style={[styles.analyticsCard, { backgroundColor: colors.backgroundElement }]}>
      <ThemedText type="small">{label}</ThemedText>
      <ThemedText type="subtitle">{value}</ThemedText>
    </View>
  );
}

export default function AdminDashboardScreen() {
  const colors = useTheme();
  const router = useRouter();
  const { signOut, profile } = useAuth();

  const [tab, setTab] = useState<CustomerTab>('retail_customer');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('active');
  const [search, setSearch] = useState('');
  const [loans, setLoans] = useState<LoanWithCustomer[]>([]);
  const [overdue, setOverdue] = useState<OverdueLoan[]>([]);
  const [yieldRows, setYieldRows] = useState<RateYield[]>([]);
  const [notices, setNotices] = useState<LoanNotice[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);

  const loadLoans = useCallback(async () => {
    const { data, error } = await supabase
      .from('loans')
      .select(
        `
        *,
        profiles:customer_id ( full_name, phone_number, address, role )
      `,
      )
      .order('created_at', { ascending: false });

    if (error) {
      console.warn(error.message);
      return;
    }

    setLoans((data ?? []) as LoanWithCustomer[]);
  }, []);

  const loadShopPanels = useCallback(async () => {
    try {
      const [overdueRows, rateRows, noticeRows] = await Promise.all([
        fetchOverdueLoans(),
        fetchRateYield(),
        fetchLoanNotices(20),
      ]);
      setOverdue(overdueRows);
      setYieldRows(rateRows);
      setNotices(noticeRows);
    } catch (err) {
      console.warn(err instanceof Error ? err.message : err);
    }
  }, []);

  const loadAll = useCallback(async () => {
    await Promise.all([loadLoans(), loadShopPanels()]);
  }, [loadLoans, loadShopPanels]);

  useEffect(() => {
    void (async () => {
      setIsLoading(true);
      await loadAll();
      setIsLoading(false);
    })();
  }, [loadAll]);

  const filteredLoans = useMemo(() => {
    const query = search.trim().toLowerCase();
    return loans.filter((loan) => {
      const role = loan.profiles?.role ?? 'retail_customer';
      if (role !== tab) return false;
      if (statusFilter !== 'all' && loan.status !== statusFilter) return false;
      if (!query) return true;

      const name = loan.profiles?.full_name?.toLowerCase() ?? '';
      const phone = loan.profiles?.phone_number?.toLowerCase() ?? '';
      const serial = loan.serial_number.toLowerCase();
      return name.includes(query) || phone.includes(query) || serial.includes(query);
    });
  }, [loans, search, tab, statusFilter]);

  const isOwner = profile?.role === 'owner';
  const totalCapitalPaise = yieldRows.reduce((sum, row) => sum + row.principal_paise, 0);
  const totalOnePeriodPaise = yieldRows.reduce((sum, row) => sum + row.one_period_yield_paise, 0);

  const onGenerateNotices = useCallback(async () => {
    setIsGenerating(true);
    try {
      const inserted = await generateLoanNotices();
      await loadShopPanels();
      Alert.alert(
        'In-app notices',
        inserted === 0
          ? 'No new notices. Existing rows were left in place.'
          : `Wrote ${inserted} in-app notice(s).`,
      );
    } catch (err) {
      Alert.alert('Could not generate notices', err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setIsGenerating(false);
    }
  }, [loadShopPanels]);

  const onExportCallList = useCallback(async () => {
    const csv = buildOverdueCallListCsv(overdue);
    try {
      await Share.share({ message: csv, title: 'Overdue call list' });
    } catch (err) {
      Alert.alert('Could not share call list', err instanceof Error ? err.message : 'Unknown error');
    }
  }, [overdue]);

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.headerRow}>
          <ThemedText type="title">{isOwner ? 'Owner Dashboard' : 'Staff Dashboard'}</ThemedText>
          <View style={styles.headerActions}>
            <Link href="/(admin)/scanner" asChild>
              <Pressable style={[styles.actionBtn, { backgroundColor: colors.backgroundSelected }]}>
                <ThemedText type="smallBold">Scan Receipt</ThemedText>
              </Pressable>
            </Link>
            <Pressable onPress={() => void signOut()}>
              <ThemedText type="smallBold">Sign out</ThemedText>
            </Pressable>
          </View>
        </View>

        {isOwner ? (
          <>
            <View style={styles.analyticsGrid}>
              <AnalyticsCard
                label="Active capital outlay"
                value={formatPaiseAsInr(totalCapitalPaise)}
              />
              <AnalyticsCard
                label="Projected 30-day yield"
                value={formatPaiseAsInr(totalOnePeriodPaise)}
              />
            </View>

            <View style={[styles.bracketCard, { backgroundColor: colors.backgroundElement }]}>
              <ThemedText type="smallBold">Yield by actual rate (original principal)</ThemedText>
              {yieldRows.length === 0 ? (
                <ThemedText type="small">No active loans to project.</ThemedText>
              ) : (
                yieldRows.map((row) => (
                  <ThemedText type="small" key={row.rate_bps}>
                    {formatBpsAsPercent(asBps(row.rate_bps))}% · {row.loan_count} loan
                    {row.loan_count === 1 ? '' : 's'} · 1P{' '}
                    {formatPaiseAsInr(row.one_period_yield_paise)} · 6P{' '}
                    {formatPaiseAsInr(row.six_period_yield_paise)} · 12P{' '}
                    {formatPaiseAsInr(row.twelve_period_yield_paise)}
                  </ThemedText>
                ))
              )}
            </View>
          </>
        ) : null}

        <View style={[styles.bracketCard, { backgroundColor: colors.backgroundElement }]}>
          <View style={styles.sectionHeader}>
            <ThemedText type="smallBold">Overdue ({overdue.length})</ThemedText>
            <View style={styles.headerActions}>
              <Pressable
                onPress={() => void onGenerateNotices()}
                disabled={isGenerating}
                style={[styles.actionBtn, { backgroundColor: colors.backgroundSelected }]}>
                <ThemedText type="smallBold">{isGenerating ? 'Generating…' : 'Generate notices'}</ThemedText>
              </Pressable>
              {overdue.length > 0 ? (
                <Pressable
                  onPress={() => void onExportCallList()}
                  style={[styles.actionBtn, { backgroundColor: colors.backgroundSelected }]}>
                  <ThemedText type="smallBold">Call list CSV</ThemedText>
                </Pressable>
              ) : null}
            </View>
          </View>
          {overdue.length === 0 ? (
            <ThemedText type="small">No overdue girvis today.</ThemedText>
          ) : (
            overdue.slice(0, 8).map((row) => (
              <Pressable
                key={row.loan_id}
                onPress={() => router.push(`/(admin)/loan/${row.loan_id}`)}>
                <ThemedText type="smallBold">{row.serial_number}</ThemedText>
                <ThemedText type="small">
                  {row.customer_name ?? 'Unknown'} · {row.phone_number ?? '—'} · {row.days_overdue}d
                  overdue · {formatPaiseAsInr(asPaise(row.total_due_paise))}
                </ThemedText>
              </Pressable>
            ))
          )}
          {overdue.length > 8 ? (
            <ThemedText type="small">And {overdue.length - 8} more — export the CSV for the full list.</ThemedText>
          ) : null}
          {notices.length > 0 ? (
            <ThemedText type="smallBold" style={styles.bracketSpacer}>
              Recent in-app notices
            </ThemedText>
          ) : null}
          {notices.slice(0, 5).map((notice) => (
            <ThemedText type="small" key={notice.id}>
              {noticeTypeLabel(notice.notice_type)} · {notice.scheduled_for} · {notice.channel}
            </ThemedText>
          ))}
        </View>

        <View style={styles.tabRow}>
          {(['retail_customer', 'merchant'] as CustomerTab[]).map((value) => (
            <Pressable
              key={value}
              onPress={() => setTab(value)}
              style={[
                styles.tab,
                {
                  backgroundColor: tab === value ? colors.backgroundSelected : colors.backgroundElement,
                },
              ]}>
              <ThemedText type="smallBold">
                {value === 'retail_customer' ? 'Retail Customers' : 'Merchants'}
              </ThemedText>
            </Pressable>
          ))}
        </View>

        <View style={styles.statusRow}>
          {(['active', 'redeemed', 'closed', 'defaulted', 'all'] as StatusFilter[]).map((value) => (
            <Pressable
              key={value}
              onPress={() => setStatusFilter(value)}
              style={[
                styles.statusChip,
                {
                  backgroundColor:
                    statusFilter === value ? colors.backgroundSelected : colors.backgroundElement,
                },
              ]}>
              <ThemedText type="smallBold">
                {value === 'all' ? 'All' : loanStatusLabel(value as LoanStatus)}
              </ThemedText>
            </Pressable>
          ))}
        </View>

        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Search by name, phone, or serial number"
          placeholderTextColor={colors.textSecondary}
          style={[styles.search, { borderColor: colors.backgroundSelected, color: colors.text }]}
        />

        {isLoading ? (
          <ActivityIndicator style={styles.loader} />
        ) : (
          <FlatList
            data={filteredLoans}
            keyExtractor={(item) => item.id}
            refreshControl={
              <RefreshControl
                refreshing={isRefreshing}
                onRefresh={() => {
                  setIsRefreshing(true);
                  void loadAll().finally(() => setIsRefreshing(false));
                }}
              />
            }
            contentContainerStyle={styles.listContent}
            ListEmptyComponent={<ThemedText style={styles.empty}>No girvis in this tab.</ThemedText>}
            renderItem={({ item }) => (
              <Pressable
                style={[styles.loanCard, { backgroundColor: colors.backgroundElement }]}
                onPress={() => router.push(`/(admin)/loan/${item.id}`)}>
                <ThemedText type="smallBold">{item.serial_number}</ThemedText>
                <ThemedText>{item.profiles?.full_name ?? 'Unknown customer'}</ThemedText>
                <ThemedText type="small">{item.profiles?.phone_number ?? '—'}</ThemedText>
                <ThemedText type="small">
                  {loanStatusLabel(item.status)} · {item.item_name} ·{' '}
                  {formatPaiseAsInr(asPaise(item.principal_paise))} ·{' '}
                  {formatBpsAsPercent(asBps(item.rate_bps))}% / 30d
                </ThemedText>
              </Pressable>
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
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.three,
    gap: Spacing.two,
  },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  actionBtn: { borderRadius: 10, paddingHorizontal: Spacing.two, paddingVertical: Spacing.one },
  analyticsGrid: {
    flexDirection: 'row',
    gap: Spacing.two,
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.three,
  },
  analyticsCard: {
    flex: 1,
    borderRadius: 14,
    padding: Spacing.three,
    gap: Spacing.one,
  },
  bracketCard: {
    marginHorizontal: Spacing.four,
    marginTop: Spacing.three,
    borderRadius: 14,
    padding: Spacing.three,
    gap: Spacing.one,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  bracketSpacer: { marginTop: Spacing.two },
  tabRow: {
    flexDirection: 'row',
    gap: Spacing.two,
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.three,
  },
  tab: { flex: 1, borderRadius: 10, paddingVertical: Spacing.two, alignItems: 'center' },
  statusRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.one,
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.two,
  },
  statusChip: { borderRadius: 10, paddingHorizontal: Spacing.two, paddingVertical: Spacing.one },
  search: {
    marginHorizontal: Spacing.four,
    marginTop: Spacing.three,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  loader: { marginTop: Spacing.five },
  listContent: { padding: Spacing.four, gap: Spacing.two },
  loanCard: { borderRadius: 14, padding: Spacing.three, gap: Spacing.one },
  empty: { textAlign: 'center', opacity: 0.7, marginTop: Spacing.five },
});
