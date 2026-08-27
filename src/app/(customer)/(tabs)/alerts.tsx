import { useCallback, useEffect, useState } from 'react';
import { Platform, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';

import { EmptyState } from '@/components/empty-state';
import { FormNotice } from '@/components/form-notice';
import { ListRow } from '@/components/list-row';
import { ListSkeleton } from '@/components/list-row-skeleton';
import { ScreenHeader } from '@/components/screen-header';
import { SettingsGroup } from '@/components/settings-group';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTabBarScrollPadding } from '@/hooks/use-tab-bar-scroll-padding';
import { unknownMessage } from '@/i18n';
import { noticeTypeLabel } from '@/lib/notices';
import { useLanguage } from '@/providers/language-provider';
import { fetchLoanNotices } from '@/services/loanService';
import type { LoanNotice } from '@/types/database';

export default function CustomerAlertsScreen() {
  const { t, language } = useLanguage();
  const tabBarPadding = useTabBarScrollPadding();

  const [notices, setNotices] = useState<LoanNotice[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const loadNotices = useCallback(async () => {
    try {
      setNotices(await fetchLoanNotices(20));
    } catch {
      setNotices([]);
    }
  }, []);

  const refresh = useCallback(async () => {
    setIsRefreshing(true);
    setLoadError(null);
    try {
      await loadNotices();
    } catch (error) {
      setLoadError(unknownMessage(error, t) === t('errors.unknown') ? t('notices.customer.loadError') : unknownMessage(error, t));
    } finally {
      setIsRefreshing(false);
    }
  }, [loadNotices, t]);

  useEffect(() => {
    void (async () => {
      setIsLoading(true);
      setLoadError(null);
      try {
        await loadNotices();
      } catch (error) {
        setLoadError(
          error instanceof Error ? error.message : t('notices.customer.loadError'),
        );
      } finally {
        setIsLoading(false);
      }
    })();
  }, [loadNotices, t]);

  return (
    <ThemedView style={styles.container} type="surfaceSunken">
      <ScreenHeader title={t('notices.customer.title')} />
      <ScrollView
        refreshControl={
          <RefreshControl refreshing={isRefreshing} onRefresh={() => void refresh()} />
        }
        contentContainerStyle={[styles.scroll, { paddingBottom: tabBarPadding }]}>
        <ThemedText type="small" themeColor="textSecondary" style={styles.lede}>
          {Platform.OS === 'web' ? t('notices.customer.subtitleWeb') : t('notices.customer.subtitle')}
        </ThemedText>
        <View style={styles.lede}>
          <FormNotice error={loadError} />
        </View>
        {isLoading ? <ListSkeleton rows={4} /> : null}
        {notices.length > 0 ? (
          <SettingsGroup>
            {notices.map((notice, index) => (
              <ListRow
                key={notice.id}
                tone="elevated"
                isLast={index === notices.length - 1}
                content={
                  <ThemedText type="label">
                    {t('notices.customer.row', {
                      type: noticeTypeLabel(notice.notice_type, language),
                      date: notice.scheduled_for,
                    })}
                  </ThemedText>
                }
              />
            ))}
          </SettingsGroup>
        ) : !isLoading ? (
          <EmptyState title={t('notices.customer.emptyTitle')} body={t('notices.customer.emptyBody')} />
        ) : null}
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
  lede: {
    paddingHorizontal: Spacing.four,
  },
});
