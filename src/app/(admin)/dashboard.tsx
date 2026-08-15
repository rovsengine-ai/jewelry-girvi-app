import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  Share,
  StyleSheet,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';

import { Badge } from '@/components/badge';
import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { EmptyState } from '@/components/empty-state';
import { Field } from '@/components/field';
import { MoneyText } from '@/components/money-text';
import { Row } from '@/components/row';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MinTouchTarget, Radii, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { asBps, asPaise, formatBpsAsPercent } from '@/lib/money';
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

function AnalyticsCard({ label, paise }: { label: string; paise: number }) {
  return (
    <Card style={styles.analyticsCard}>
      <ThemedText type="small">{label}</ThemedText>
      <MoneyText paise={asPaise(paise)} />
    </Card>
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
        <Row style={styles.headerRow}>
          <ThemedText type="subtitle">{isOwner ? 'Owner Dashboard' : 'Staff Dashboard'}</ThemedText>
          <View style={styles.headerActions}>
            <Button label="Scan Receipt" onPress={() => router.push('/(admin)/scanner')} />
            <Button label="Sign out" variant="secondary" onPress={() => void signOut()} />
          </View>
        </Row>

        {isOwner ? (
          <>
            <View style={styles.analyticsGrid}>
              <AnalyticsCard label="Active capital outlay" paise={totalCapitalPaise} />
              <AnalyticsCard label="Projected 30-day yield" paise={totalOnePeriodPaise} />
            </View>

            <Card style={styles.sectionCard}>
              <ThemedText type="smallBold">Yield by actual rate (original principal)</ThemedText>
              {yieldRows.length === 0 ? (
                <EmptyState title="No yield yet" body="No active loans to project." />
              ) : (
                yieldRows.map((row) => (
                  <Row key={row.rate_bps}>
                    <ThemedText type="small">
                      {formatBpsAsPercent(asBps(row.rate_bps))}% · {row.loan_count} loan
                      {row.loan_count === 1 ? '' : 's'}
                    </ThemedText>
                    <MoneyText paise={asPaise(row.one_period_yield_paise)} />
                  </Row>
                ))
              )}
            </Card>
          </>
        ) : null}

        <Card style={styles.sectionCard}>
          <Row style={styles.sectionHeader}>
            <ThemedText type="smallBold">Overdue ({overdue.length})</ThemedText>
            <View style={styles.headerActions}>
              <Button
                label={isGenerating ? 'Generating…' : 'Generate notices'}
                variant="secondary"
                loading={isGenerating}
                onPress={() => void onGenerateNotices()}
              />
              {overdue.length > 0 ? (
                <Button label="Call list CSV" variant="secondary" onPress={() => void onExportCallList()} />
              ) : null}
            </View>
          </Row>
          {overdue.length === 0 ? (
            <EmptyState title="None overdue" body="No overdue girvis today." />
          ) : (
            overdue.slice(0, 8).map((row) => (
              <Pressable
                key={row.loan_id}
                onPress={() => router.push(`/(admin)/loan/${row.loan_id}`)}
                style={styles.hit}>
                <Row>
                  <ThemedText type="smallBold">{row.serial_number}</ThemedText>
                  <MoneyText paise={asPaise(row.total_due_paise)} />
                </Row>
                <ThemedText type="small">
                  {row.customer_name ?? 'Unknown'} · {row.phone_number ?? '—'} · {row.days_overdue}d
                  overdue
                </ThemedText>
              </Pressable>
            ))
          )}
          {overdue.length > 8 ? (
            <ThemedText type="small">And {overdue.length - 8} more — export the CSV for the full list.</ThemedText>
          ) : null}
          {notices.length > 0 ? (
            <ThemedText type="smallBold">Recent in-app notices</ThemedText>
          ) : null}
          {notices.slice(0, 5).map((notice) => (
            <ThemedText type="small" key={notice.id}>
              {noticeTypeLabel(notice.notice_type)} · {notice.scheduled_for} · {notice.channel}
            </ThemedText>
          ))}
        </Card>

        <View style={styles.tabRow}>
          {(['retail_customer', 'merchant'] as CustomerTab[]).map((value) => (
            <Pressable
              key={value}
              onPress={() => setTab(value)}
              style={[
                styles.tab,
                {
                  backgroundColor: tab === value ? colors.backgroundSelected : colors.elevated,
                  borderColor: colors.border,
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
                    statusFilter === value ? colors.backgroundSelected : colors.elevated,
                  borderColor: colors.border,
                },
              ]}>
              <ThemedText type="smallBold">
                {value === 'all' ? 'All' : loanStatusLabel(value as LoanStatus)}
              </ThemedText>
            </Pressable>
          ))}
        </View>

        <View style={styles.searchWrap}>
          <Field
            label="Search"
            value={search}
            onChangeText={setSearch}
            placeholder="Name, phone, or serial number"
          />
        </View>

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
            ListEmptyComponent={
              <EmptyState title="No girvis" body="No girvis in this tab." />
            }
            renderItem={({ item }) => (
              <Pressable onPress={() => router.push(`/(admin)/loan/${item.id}`)}>
                <Card>
                  <Row>
                    <ThemedText type="smallBold">{item.serial_number}</ThemedText>
                    <Badge status={item.status} />
                  </Row>
                  <ThemedText>{item.profiles?.full_name ?? 'Unknown customer'}</ThemedText>
                  <ThemedText type="small">{item.profiles?.phone_number ?? '—'}</ThemedText>
                  <Row>
                    <ThemedText type="small">
                      {item.item_name} · {formatBpsAsPercent(asBps(item.rate_bps))}% / 30d
                    </ThemedText>
                    <MoneyText paise={asPaise(item.principal_paise)} />
                  </Row>
                </Card>
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
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.three,
    flexWrap: 'wrap',
  },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, flexWrap: 'wrap' },
  analyticsGrid: {
    flexDirection: 'row',
    gap: Spacing.two,
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.three,
  },
  analyticsCard: { flex: 1 },
  sectionCard: { marginHorizontal: Spacing.four, marginTop: Spacing.three },
  sectionHeader: { flexWrap: 'wrap' },
  hit: { minHeight: MinTouchTarget, justifyContent: 'center' },
  tabRow: {
    flexDirection: 'row',
    gap: Spacing.two,
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.three,
  },
  tab: {
    flex: 1,
    minHeight: MinTouchTarget,
    borderRadius: Radii.sm,
    borderWidth: 1,
    paddingVertical: Spacing.two,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.one,
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.two,
  },
  statusChip: {
    minHeight: MinTouchTarget,
    borderRadius: Radii.sm,
    borderWidth: 1,
    paddingHorizontal: Spacing.two,
    justifyContent: 'center',
  },
  searchWrap: { paddingHorizontal: Spacing.four, paddingTop: Spacing.three },
  loader: { marginTop: Spacing.five },
  listContent: { padding: Spacing.four, gap: Spacing.two },
});
