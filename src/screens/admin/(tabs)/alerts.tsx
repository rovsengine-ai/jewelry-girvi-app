import { useCallback, useEffect, useState } from 'react';
import { ScrollView, Share, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';

import { Button } from '@/components/button';
import { EmptyState } from '@/components/empty-state';
import { FormNotice } from '@/components/form-notice';
import { ListRow } from '@/components/list-row';
import { MoneyText } from '@/components/money-text';
import { AvatarMonogram } from '@/components/avatar-monogram';
import { ScreenHeader } from '@/components/screen-header';
import { SectionLabel } from '@/components/section-label';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTabBarScrollPadding } from '@/hooks/use-tab-bar-scroll-padding';
import { asPaise } from '@/lib/money';
import { buildOverdueCallListCsv, noticeTypeLabel } from '@/lib/notices';
import { useLanguage } from '@/providers/language-provider';
import { fetchLoanNotices, fetchOverdueLoans } from '@/services/loanService';
import { generateLoanNoticesAndPush } from '@/services/pushTokenService';
import type { LoanNotice, OverdueLoan } from '@/types/database';

export default function AdminAlertsScreen() {
  const router = useRouter();
  const { t, language } = useLanguage();
  const tabBarPadding = useTabBarScrollPadding();

  const [overdue, setOverdue] = useState<OverdueLoan[]>([]);
  const [notices, setNotices] = useState<LoanNotice[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [formNotice, setFormNotice] = useState<string | null>(null);

  const loadShopPanels = useCallback(async () => {
    try {
      const [overdueRows, noticeRows] = await Promise.all([
        fetchOverdueLoans(),
        fetchLoanNotices(20),
      ]);
      setOverdue(overdueRows);
      setNotices(noticeRows);
    } catch (err) {
      throw err instanceof Error ? err : new Error(t('notices.admin.loadPanels'));
    }
  }, [t]);

  useEffect(() => {
    void (async () => {
      setLoadError(null);
      try {
        await loadShopPanels();
      } catch (error) {
        setLoadError(error instanceof Error ? error.message : t('notices.admin.loadErrorBody'));
      }
    })();
  }, [loadShopPanels, t]);

  const onGenerateNotices = useCallback(async () => {
    setIsGenerating(true);
    setFormError(null);
    setFormNotice(null);
    try {
      const { inserted } = await generateLoanNoticesAndPush();
      await loadShopPanels();
      setFormNotice(
        inserted === 0
          ? t('notices.admin.generatedNone')
          : t('notices.admin.generatedCount', { count: inserted }),
      );
    } catch (err) {
      setFormError(err instanceof Error ? err.message : t('errors.unknown'));
    } finally {
      setIsGenerating(false);
    }
  }, [loadShopPanels, t]);

  const onExportCallList = useCallback(async () => {
    const csv = buildOverdueCallListCsv(overdue);
    try {
      await Share.share({ message: csv, title: t('notices.admin.callListShareTitle') });
    } catch (err) {
      setFormError(err instanceof Error ? err.message : t('errors.unknown'));
    }
  }, [overdue, t]);

  return (
    <ThemedView style={styles.container} type="surfaceSunken">
      <ScreenHeader title={t('notices.admin.title')} />
      <ScrollView contentContainerStyle={[styles.scroll, { paddingBottom: tabBarPadding }]}>
        {loadError ? <EmptyState title={t('notices.admin.loadErrorTitle')} body={loadError} /> : null}
        <View style={styles.noticeWrap}>
          <FormNotice error={formError} notice={formNotice} />
        </View>

        <SectionLabel>{t('notices.admin.overdueCount', { count: overdue.length })}</SectionLabel>
        <View style={styles.headerActions}>
          <Button
            label={isGenerating ? t('common.generating') : t('notices.admin.generate')}
            variant="secondary"
            loading={isGenerating}
            requiresNetwork
            onPress={() => void onGenerateNotices()}
          />
          {overdue.length > 0 ? (
            <Button
              label={t('notices.admin.callListCsv')}
              variant="secondary"
              onPress={() => void onExportCallList()}
            />
          ) : null}
        </View>
        {overdue.length === 0 ? (
          <EmptyState title={t('notices.admin.noneTitle')} body={t('notices.admin.noneBody')} />
        ) : (
          overdue.slice(0, 8).map((row, index, list) => (
            <ListRow
              key={row.loan_id}
              onPress={() => router.push(`/(admin)/loan/${row.loan_id}`)}
              isLast={index === list.length - 1}
              leading={<AvatarMonogram name={row.customer_name} />}
              content={
                <>
                  <ThemedText type="bodyLarge" numberOfLines={1}>
                    {row.serial_number}
                  </ThemedText>
                  <ThemedText type="label" themeColor="textSecondary" numberOfLines={1}>
                    {t('notices.admin.overdueRow', {
                      name: row.customer_name ?? t('common.unknown'),
                      phone: row.phone_number ?? t('common.emDash'),
                      days: row.days_overdue,
                    })}
                  </ThemedText>
                </>
              }
              trailing={<MoneyText paise={asPaise(row.total_due_paise)} />}
            />
          ))
        )}
        {overdue.length > 8 ? (
          <ThemedText type="small" style={styles.more}>
            {t('notices.admin.moreOverdue', { count: overdue.length - 8 })}
          </ThemedText>
        ) : null}
        {notices.length > 0 ? (
          <SectionLabel>{t('notices.admin.recentTitle')}</SectionLabel>
        ) : null}
        {notices.slice(0, 5).map((notice, index, list) => (
          <ListRow
            key={notice.id}
            isLast={index === list.length - 1}
            content={
              <ThemedText type="label">
                {t('notices.admin.recentRow', {
                  type: noticeTypeLabel(notice.notice_type, language),
                  date: notice.scheduled_for,
                  channel: notice.channel,
                })}
              </ThemedText>
            }
          />
        ))}
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: {
    paddingTop: Spacing.three,
    gap: Spacing.two,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    flexWrap: 'wrap',
    paddingHorizontal: Spacing.four,
  },
  noticeWrap: { paddingHorizontal: Spacing.four, paddingTop: Spacing.two },
  more: { paddingHorizontal: Spacing.four },
});
