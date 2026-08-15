import { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';

import { Card } from '@/components/card';
import { EmptyState } from '@/components/empty-state';
import { ListRow } from '@/components/list-row';
import { ListSkeleton } from '@/components/list-row-skeleton';
import { MoneyText } from '@/components/money-text';
import { ScreenHeader } from '@/components/screen-header';
import { SectionLabel } from '@/components/section-label';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTabBarScrollPadding } from '@/hooks/use-tab-bar-scroll-padding';
import { asBps, asPaise, formatBpsAsPercent } from '@/lib/money';
import { ADMIN_LOANS_HREF, isShopOwner } from '@/lib/shop-tab-access';
import { useAuth } from '@/providers/auth-provider';
import { useLanguage } from '@/providers/language-provider';
import { fetchRateYield } from '@/services/loanService';
import type { RateYield } from '@/types/database';

function AnalyticsCard({ label, paise }: { label: string; paise: number }) {
  return (
    <Card style={styles.analyticsCard}>
      <ThemedText type="small">{label}</ThemedText>
      <MoneyText paise={asPaise(paise)} />
    </Card>
  );
}

/**
 * Owner-only. href: null hides the tab for staff; this screen still redirects
 * if a staff account types the URL. Hiding a tab is not a permission.
 */
export default function AdminInsightsScreen() {
  const router = useRouter();
  const { profile, isLoading: authLoading } = useAuth();
  const { t } = useLanguage();
  const tabBarPadding = useTabBarScrollPadding();

  const [yieldRows, setYieldRows] = useState<RateYield[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const isOwner = isShopOwner(profile?.role);

  useEffect(() => {
    if (authLoading) return;
    if (!isOwner) {
      router.replace(ADMIN_LOANS_HREF);
    }
  }, [authLoading, isOwner, router]);

  const loadYield = useCallback(async () => {
    try {
      const rateRows = await fetchRateYield();
      setYieldRows(rateRows);
    } catch (err) {
      throw err instanceof Error ? err : new Error(t('loans.insights.loadYield'));
    }
  }, [t]);

  useEffect(() => {
    if (!isOwner) return;
    void (async () => {
      setIsLoading(true);
      setLoadError(null);
      try {
        await loadYield();
      } catch (error) {
        setLoadError(error instanceof Error ? error.message : t('loans.insights.loadErrorBody'));
      } finally {
        setIsLoading(false);
      }
    })();
  }, [isOwner, loadYield, t]);

  const totalCapitalPaise = yieldRows.reduce((sum, row) => sum + row.principal_paise, 0);
  const totalOnePeriodPaise = yieldRows.reduce((sum, row) => sum + row.one_period_yield_paise, 0);

  if (authLoading || !isOwner) {
    return (
      <ThemedView style={styles.container} type="surfaceSunken">
        <ListSkeleton rows={4} />
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container} type="surfaceSunken">
      <ScreenHeader title={t('loans.insights.title')} />
      <ScrollView contentContainerStyle={[styles.scroll, { paddingBottom: tabBarPadding }]}>
        {loadError ? (
          <EmptyState title={t('loans.insights.loadErrorTitle')} body={loadError} />
        ) : null}
        {isLoading ? <ListSkeleton rows={4} /> : null}

        <View style={styles.analyticsGrid}>
          <AnalyticsCard label={t('loans.insights.activeCapitalOutlay')} paise={totalCapitalPaise} />
          <AnalyticsCard
            label={t('loans.insights.projected30DayYield')}
            paise={totalOnePeriodPaise}
          />
        </View>

        <SectionLabel>{t('loans.insights.yieldByRate')}</SectionLabel>
        {yieldRows.length === 0 ? (
          <EmptyState
            title={t('loans.insights.yieldEmptyTitle')}
            body={t('loans.insights.yieldEmptyBody')}
          />
        ) : (
          yieldRows.map((row, index) => (
            <ListRow
              key={row.rate_bps}
              tone="elevated"
              isLast={index === yieldRows.length - 1}
              content={
                <ThemedText type="label">
                  {t('loans.insights.yieldRow', {
                    rate: formatBpsAsPercent(asBps(row.rate_bps)),
                    count: row.loan_count,
                    loans: row.loan_count === 1 ? t('common.loan') : t('common.loans'),
                  })}
                </ThemedText>
              }
              trailing={<MoneyText paise={asPaise(row.one_period_yield_paise)} />}
            />
          ))
        )}
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: {
    paddingTop: Spacing.three,
    gap: Spacing.three,
  },
  analyticsGrid: {
    flexDirection: 'row',
    gap: Spacing.two,
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.three,
  },
  analyticsCard: { flex: 1 },
});
