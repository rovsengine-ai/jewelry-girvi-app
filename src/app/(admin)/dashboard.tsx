import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
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
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/providers/auth-provider';
import type { LoanWithCustomer } from '@/types/database';

type CustomerTab = 'retail_customer' | 'merchant';

interface Analytics {
  totalActiveCapitalPaise: number;
  periodInterestYieldPaise: number;
  bracket300: { onePeriod: number; sixPeriods: number; twelvePeriods: number };
  bracket400: { onePeriod: number; sixPeriods: number; twelvePeriods: number };
}

/** Integer paise: principal * rate_bps * periods / 10000 (truncated). Placeholder until SQL engine. */
function projectYieldPaise(principalPaise: number, rateBps: number, periods: number): number {
  return Math.trunc((principalPaise * rateBps * periods) / 10000);
}

function computeAnalytics(loans: LoanWithCustomer[]): Analytics {
  const activeLoans = loans.filter((loan) => loan.status === 'active');

  const totalActiveCapitalPaise = activeLoans.reduce(
    (sum, loan) => sum + asPaise(loan.principal_paise),
    0,
  );

  const periodInterestYieldPaise = activeLoans.reduce((sum, loan) => {
    return sum + projectYieldPaise(asPaise(loan.principal_paise), asBps(loan.rate_bps), 1);
  }, 0);

  const bracket300Loans = activeLoans.filter((loan) => asBps(loan.rate_bps) === 300);
  const bracket400Loans = activeLoans.filter((loan) => asBps(loan.rate_bps) === 400);

  const sumBracket = (items: LoanWithCustomer[], periods: number, rateBps: number) =>
    items.reduce(
      (sum, loan) => sum + projectYieldPaise(asPaise(loan.principal_paise), rateBps, periods),
      0,
    );

  return {
    totalActiveCapitalPaise,
    periodInterestYieldPaise,
    bracket300: {
      onePeriod: sumBracket(bracket300Loans, 1, 300),
      sixPeriods: sumBracket(bracket300Loans, 6, 300),
      twelvePeriods: sumBracket(bracket300Loans, 12, 300),
    },
    bracket400: {
      onePeriod: sumBracket(bracket400Loans, 1, 400),
      sixPeriods: sumBracket(bracket400Loans, 6, 400),
      twelvePeriods: sumBracket(bracket400Loans, 12, 400),
    },
  };
}

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
  const [search, setSearch] = useState('');
  const [loans, setLoans] = useState<LoanWithCustomer[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const loadLoans = useCallback(async () => {
    const { data, error } = await supabase
      .from('loans')
      .select(
        `
        *,
        profiles:customer_id ( full_name, phone_number, address, role )
      `,
      )
      .eq('status', 'active')
      .order('created_at', { ascending: false });

    if (error) {
      console.warn(error.message);
      return;
    }

    setLoans((data ?? []) as LoanWithCustomer[]);
  }, []);

  useEffect(() => {
    void (async () => {
      setIsLoading(true);
      await loadLoans();
      setIsLoading(false);
    })();
  }, [loadLoans]);

  const filteredLoans = useMemo(() => {
    const query = search.trim().toLowerCase();
    return loans.filter((loan) => {
      const role = loan.profiles?.role ?? 'retail_customer';
      if (role !== tab) return false;
      if (!query) return true;

      const name = loan.profiles?.full_name?.toLowerCase() ?? '';
      const phone = loan.profiles?.phone_number?.toLowerCase() ?? '';
      const serial = loan.serial_number.toLowerCase();
      return name.includes(query) || phone.includes(query) || serial.includes(query);
    });
  }, [loans, search, tab]);

  const analytics = useMemo(() => computeAnalytics(loans), [loans]);
  const isOwner = profile?.role === 'owner';

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
                label="Active Capital Outlay"
                value={formatPaiseAsInr(analytics.totalActiveCapitalPaise)}
              />
              <AnalyticsCard
                label="30-day Interest Revenue"
                value={formatPaiseAsInr(analytics.periodInterestYieldPaise)}
              />
            </View>

            <View style={[styles.bracketCard, { backgroundColor: colors.backgroundElement }]}>
              <ThemedText type="smallBold">300 bps (3%) Bracket</ThemedText>
              <ThemedText type="small">
                1P {formatPaiseAsInr(analytics.bracket300.onePeriod)} · 6P{' '}
                {formatPaiseAsInr(analytics.bracket300.sixPeriods)} · 12P{' '}
                {formatPaiseAsInr(analytics.bracket300.twelvePeriods)}
              </ThemedText>
              <ThemedText type="smallBold" style={styles.bracketSpacer}>
                400 bps (4%) Bracket
              </ThemedText>
              <ThemedText type="small">
                1P {formatPaiseAsInr(analytics.bracket400.onePeriod)} · 6P{' '}
                {formatPaiseAsInr(analytics.bracket400.sixPeriods)} · 12P{' '}
                {formatPaiseAsInr(analytics.bracket400.twelvePeriods)}
              </ThemedText>
            </View>
          </>
        ) : null}

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
                  void loadLoans().finally(() => setIsRefreshing(false));
                }}
              />
            }
            contentContainerStyle={styles.listContent}
            ListEmptyComponent={<ThemedText style={styles.empty}>No active girvis in this tab.</ThemedText>}
            renderItem={({ item }) => (
              <Pressable
                style={[styles.loanCard, { backgroundColor: colors.backgroundElement }]}
                onPress={() => router.push(`/(admin)/loan/${item.id}`)}>
                <ThemedText type="smallBold">{item.serial_number}</ThemedText>
                <ThemedText>{item.profiles?.full_name ?? 'Unknown customer'}</ThemedText>
                <ThemedText type="small">{item.profiles?.phone_number ?? '—'}</ThemedText>
                <ThemedText type="small">
                  {item.item_name} · {formatPaiseAsInr(asPaise(item.principal_paise))} ·{' '}
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
  bracketSpacer: { marginTop: Spacing.two },
  tabRow: {
    flexDirection: 'row',
    gap: Spacing.two,
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.three,
  },
  tab: { flex: 1, borderRadius: 10, paddingVertical: Spacing.two, alignItems: 'center' },
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
