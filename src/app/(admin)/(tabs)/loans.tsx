/**
 * Shop loan book. Owner always sees rows; staff see none while concealed
 * (RLS, not a client filter). Refetch on tab focus after the owner reveals.
 *
 * Expo Router (SDK 57): https://docs.expo.dev/versions/v57.0.0/sdk/router/
 */
import { useCallback, useMemo, useState } from 'react';
import { RefreshControl, SectionList, StyleSheet, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';

import { AdminLoanRow } from '@/components/admin-loan-row';
import { AppIcon } from '@/components/app-icon';
import { EmptyState } from '@/components/empty-state';
import { Fab } from '@/components/fab';
import { FilterChip, FilterChipRow } from '@/components/filter-chip';
import { FormNotice } from '@/components/form-notice';
import { ListSkeleton } from '@/components/list-row-skeleton';
import { PressableScale } from '@/components/pressable-scale';
import { ScreenHeader } from '@/components/screen-header';
import { SearchField } from '@/components/search-field';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MinTouchTarget, Spacing, Sizes } from '@/constants/theme';
import { useReduceMotion } from '@/hooks/use-reduce-motion';
import { useTabBarScrollPadding } from '@/hooks/use-tab-bar-scroll-padding';
import { useTheme } from '@/hooks/use-theme';
import { unknownMessage } from '@/i18n';
import { loanStatusLabel, parseOwnerOnlyError } from '@/lib/redemption';
import { isShopOwner } from '@/lib/shop-tab-access';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/providers/auth-provider';
import { useLanguage } from '@/providers/language-provider';
import { archiveLoan, fetchLoansConcealed } from '@/services/loanService';
import type { LoanStatus, LoanWithCustomer } from '@/types/database';

type CustomerTab = 'retail_customer' | 'merchant';
type StatusFilter = 'active' | 'redeemed' | 'closed' | 'defaulted' | 'all';

const STATUS_ORDER: LoanStatus[] = ['active', 'redeemed', 'closed', 'defaulted'];

type LoanSection = {
  title: string;
  status: LoanStatus;
  data: LoanWithCustomer[];
};

export default function AdminLoansScreen() {
  const colors = useTheme();
  const router = useRouter();
  const { profile } = useAuth();
  const { t, language } = useLanguage();
  const tabBarPadding = useTabBarScrollPadding();
  const reduceMotion = useReduceMotion();

  const [tab, setTab] = useState<CustomerTab>('retail_customer');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('active');
  const [search, setSearch] = useState('');
  const [loans, setLoans] = useState<LoanWithCustomer[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [archiveNotice, setArchiveNotice] = useState<string | null>(null);
  const [archiveError, setArchiveError] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [loansConcealed, setLoansConcealed] = useState(false);

  const isOwner = isShopOwner(profile?.role);

  const loadLoans = useCallback(async () => {
    const concealed = await fetchLoansConcealed();
    setLoansConcealed(concealed);
    if (concealed && !isOwner) {
      setLoans([]);
      return;
    }

    // Owner RLS still SELECTs archived rows; this filter is UX so they live
    // on the Archive screen, not the live book. Staff never see them via RLS.
    const { data, error } = await supabase
      .from('loans')
      .select(
        `
        *,
        profiles:customer_id ( full_name, phone_number, address, role )
      `,
      )
      .is('archived_at', null)
      .order('created_at', { ascending: false });

    if (error) {
      throw new Error(error.message);
    }

    setLoans((data ?? []) as LoanWithCustomer[]);
  }, [isOwner]);

  useFocusEffect(
    useCallback(() => {
      // https://docs.expo.dev/versions/v57.0.0/sdk/router/#usefocuseffecteffect-do_not_pass_a_second_prop
      let active = true;
      void (async () => {
        setLoadError(null);
        try {
          await loadLoans();
        } catch (error) {
          if (active) {
            setLoadError(error instanceof Error ? error.message : t('loans.loadErrorBody'));
          }
        } finally {
          if (active) setIsLoading(false);
        }
      })();
      return () => {
        active = false;
      };
    }, [loadLoans, t]),
  );

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

  const sections = useMemo<LoanSection[]>(() => {
    const groups = new Map<LoanStatus, LoanWithCustomer[]>();
    for (const status of STATUS_ORDER) {
      groups.set(status, []);
    }
    for (const loan of filteredLoans) {
      groups.get(loan.status)?.push(loan);
    }
    return STATUS_ORDER.map((status) => ({
      title: loanStatusLabel(status, language),
      status,
      data: groups.get(status) ?? [],
    })).filter((section) => section.data.length > 0);
  }, [filteredLoans, language]);

  const canAddGirvi = isOwner || !loansConcealed;
  const listBottom = tabBarPadding + Sizes.fab + Spacing.four;
  const openAddGirvi = () => router.push('/(admin)/scanner');

  return (
    <ThemedView style={styles.container} type="surfaceSunken">
      <ScreenHeader
        title={isOwner ? t('loans.ownerTitle') : t('loans.staffTitle')}
        collapsed={collapsed}
        trailing={
          canAddGirvi ? (
            <PressableScale
              testID="loans-add-header"
              accessibilityRole="button"
              accessibilityLabel={t('a11y.scanPledge')}
              onPress={openAddGirvi}
              style={styles.headerAdd}>
              <AppIcon ios="plus.circle.fill" android="add_circle" color={colors.onChrome} />
            </PressableScale>
          ) : undefined
        }
      />

      {loadError ? <EmptyState title={t('loans.loadErrorTitle')} body={loadError} /> : null}
      <FormNotice error={archiveError} notice={archiveNotice} />

      <View style={styles.searchWrap}>
        <SearchField
          value={search}
          onChangeText={setSearch}
          placeholder={t('loans.searchPlaceholder')}
        />
      </View>

      <View style={styles.chipBlock}>
        <FilterChipRow>
          {(['retail_customer', 'merchant'] as CustomerTab[]).map((value) => (
            <FilterChip
              key={value}
              label={value === 'retail_customer' ? t('loans.retailCustomers') : t('loans.merchants')}
              selected={tab === value}
              onPress={() => setTab(value)}
            />
          ))}
        </FilterChipRow>
      </View>
      <View style={styles.chipBlock}>
        <FilterChipRow>
          {(['active', 'redeemed', 'closed', 'defaulted', 'all'] as StatusFilter[]).map((value) => (
            <FilterChip
              key={value}
              label={value === 'all' ? t('loans.filterAll') : loanStatusLabel(value, language)}
              selected={statusFilter === value}
              onPress={() => setStatusFilter(value)}
            />
          ))}
        </FilterChipRow>
      </View>

      {isLoading ? (
        <ListSkeleton />
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(item) => item.id}
          stickySectionHeadersEnabled
          onScroll={(event) => {
            const next = event.nativeEvent.contentOffset.y > Spacing.two;
            if (next !== collapsed) setCollapsed(next);
          }}
          scrollEventThrottle={16}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={() => {
                setIsRefreshing(true);
                setLoadError(null);
                void loadLoans()
                  .catch((error: unknown) => {
                    setLoadError(
                      error instanceof Error ? error.message : t('loans.loadErrorBody'),
                    );
                  })
                  .finally(() => setIsRefreshing(false));
              }}
            />
          }
          contentContainerStyle={[styles.listContent, { paddingBottom: listBottom }]}
          ListEmptyComponent={
            loansConcealed && !isOwner ? (
              <EmptyState
                title={t('loans.concealedTitle')}
                body={t('loans.concealedBody')}
                iconIos="eye.slash"
                iconAndroid="lock"
              />
            ) : (
              <EmptyState
                title={t('loans.emptyTitle')}
                body={t('loans.emptyBody')}
                actionLabel={t('loans.scanReceipt')}
                onAction={openAddGirvi}
                iconIos="tray"
                iconAndroid="inbox"
              />
            )
          }
          renderSectionHeader={({ section }) => (
            <View style={[styles.sectionHeader, { backgroundColor: colors.backgroundElement }]}>
              <ThemedText type="overline" themeColor="textSecondary">
                {section.title}
              </ThemedText>
            </View>
          )}
          renderItem={({ item, index, section }) => (
            <AdminLoanRow
              loan={item}
              index={index}
              reduceMotion={reduceMotion}
              canArchive={isOwner}
              isLast={index === section.data.length - 1}
              onPress={() => router.push(`/(admin)/loan/${item.id}`)}
              onArchive={async (reason) => {
                setArchiveError(null);
                setArchiveNotice(null);
                try {
                  await archiveLoan({ loanId: item.id, reason });
                  await loadLoans();
                  setArchiveNotice(t('archive.notice'));
                } catch (error) {
                  const message = unknownMessage(error, t);
                  const next = parseOwnerOnlyError(message)
                    ? t('archive.ownerOnly')
                    : message;
                  setArchiveError(next);
                  throw new Error(next);
                }
              }}
            />
          )}
        />
      )}

      {canAddGirvi ? (
        <Fab
          testID="loans-add-fab"
          accessibilityLabel={t('a11y.scanPledge')}
          bottom={tabBarPadding + Spacing.three}
          onPress={openAddGirvi}
        />
      ) : null}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  headerAdd: {
    minWidth: MinTouchTarget,
    minHeight: MinTouchTarget,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchWrap: {
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.three,
    paddingBottom: Spacing.two,
  },
  chipBlock: {
    paddingBottom: Spacing.two,
  },
  listContent: { flexGrow: 1 },
  sectionHeader: {
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.two,
  },
});
