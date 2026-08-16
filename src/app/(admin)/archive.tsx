/**
 * Owner-only archived girvis. Staff who type this URL are redirected from
 * this screen and from `(admin)/_layout.tsx`. Hiding the Settings link is
 * not a permission.
 *
 * Expo Router (SDK 57): https://docs.expo.dev/versions/v57.0.0/sdk/router/
 */
import { useCallback, useEffect, useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';

import { Button } from '@/components/button';
import { EmptyState } from '@/components/empty-state';
import { FormNotice } from '@/components/form-notice';
import { ListRow } from '@/components/list-row';
import { ListSkeleton } from '@/components/list-row-skeleton';
import { MoneyText } from '@/components/money-text';
import { AvatarMonogram } from '@/components/avatar-monogram';
import { ScreenHeader } from '@/components/screen-header';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { asPaise } from '@/lib/money';
import { parseOwnerOnlyError } from '@/lib/redemption';
import { ADMIN_LOANS_HREF, isShopOwner } from '@/lib/shop-tab-access';
import { useAuth } from '@/providers/auth-provider';
import { useLanguage } from '@/providers/language-provider';
import { fetchArchivedLoans, unarchiveLoan } from '@/services/loanService';
import type { ArchivedLoan } from '@/types/database';

function formatArchivedAt(iso: string): string {
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(iso));
}

export default function AdminArchiveScreen() {
  const router = useRouter();
  const { profile, isLoading: authLoading } = useAuth();
  const { t } = useLanguage();

  const [rows, setRows] = useState<ArchivedLoan[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [formNotice, setFormNotice] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const isOwner = isShopOwner(profile?.role);

  useEffect(() => {
    if (authLoading) return;
    if (!isOwner) {
      router.replace(ADMIN_LOANS_HREF);
    }
  }, [authLoading, isOwner, router]);

  const loadRows = useCallback(async () => {
    setLoadError(null);
    try {
      setRows(await fetchArchivedLoans());
    } catch (error) {
      throw error instanceof Error ? error : new Error(t('archive.loadErrorBody'));
    }
  }, [t]);

  useEffect(() => {
    if (!isOwner) return;
    void (async () => {
      setIsLoading(true);
      try {
        await loadRows();
      } catch (error) {
        setLoadError(error instanceof Error ? error.message : t('archive.loadErrorBody'));
      } finally {
        setIsLoading(false);
      }
    })();
  }, [isOwner, loadRows, t]);

  const handleUnarchive = async (loanId: string) => {
    setFormError(null);
    setFormNotice(null);
    setPendingId(loanId);
    try {
      await unarchiveLoan(loanId);
      await loadRows();
      setConfirmId(null);
      setFormNotice(t('archive.unarchiveNotice'));
    } catch (error) {
      const message = error instanceof Error ? error.message : t('errors.unknown');
      setFormError(parseOwnerOnlyError(message) ? t('archive.ownerOnly') : message);
    } finally {
      setPendingId(null);
    }
  };

  if (authLoading || !isOwner) {
    return (
      <ThemedView style={styles.container}>
        <ListSkeleton rows={4} />
      </ThemedView>
    );
  }

  if (isLoading) {
    return (
      <ThemedView style={styles.container}>
        <ScreenHeader showBack title={t('archive.title')} />
        <ListSkeleton rows={6} />
      </ThemedView>
    );
  }

  if (loadError) {
    return (
      <ThemedView style={styles.container}>
        <ScreenHeader showBack title={t('archive.title')} />
        <View style={styles.body}>
          <Button label={t('common.back')} variant="secondary" onPress={() => router.back()} />
          <EmptyState title={t('archive.loadErrorTitle')} body={loadError} />
        </View>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container} type="surfaceSunken">
      <ScreenHeader showBack title={t('archive.title')} />
      <View style={styles.body}>
        <View style={styles.padded}>
          <Button label={t('common.back')} variant="secondary" onPress={() => router.back()} />
          <ThemedText type="small">{t('archive.listHint')}</ThemedText>
          <FormNotice error={formError} notice={formNotice} />
        </View>
        <FlatList
          data={rows}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <EmptyState title={t('archive.emptyTitle')} body={t('archive.emptyBody')} />
          }
          renderItem={({ item }) => (
            <View>
              <ListRow
                leading={<AvatarMonogram name={item.customer_name} />}
                isLast={false}
                content={
                  <>
                    <ThemedText type="bodyLarge" numberOfLines={1}>
                      {item.customer_name ?? t('common.unknownCustomer')}
                    </ThemedText>
                    <ThemedText type="label" themeColor="textSecondary" numberOfLines={1}>
                      {item.serial_number}
                    </ThemedText>
                  </>
                }
                trailing={<MoneyText paise={asPaise(item.archive_balance_paise)} />}
              />
              <View style={styles.meta}>
                <ThemedText type="label" themeColor="textSecondary">
                  {t('archive.archivedOn', { when: formatArchivedAt(item.archived_at) })}
                </ThemedText>
                <ThemedText type="label" themeColor="textSecondary">
                  {t('archive.archivedBy', {
                    name: item.archived_by_name ?? t('common.unknown'),
                  })}
                </ThemedText>
                <ThemedText type="label" themeColor="textSecondary">
                  {t('archive.reasonLine', { reason: item.archive_reason })}
                </ThemedText>
                <ThemedText type="overline" themeColor="textSecondary">
                  {t('archive.frozenBalance')}
                </ThemedText>
                {confirmId === item.id ? (
                  <View style={styles.confirm}>
                    <ThemedText type="small">
                      {t('archive.unarchiveConfirmBody', { serial: item.serial_number })}
                    </ThemedText>
                    <Button
                      label={t('common.cancel')}
                      variant="secondary"
                      onPress={() => setConfirmId(null)}
                    />
                    <Button
                      testID={`confirm-unarchive-${item.id}`}
                      label={t('archive.unarchive')}
                      loading={pendingId === item.id}
                      onPress={() => void handleUnarchive(item.id)}
                    />
                  </View>
                ) : (
                  <Button
                    testID={`open-unarchive-${item.id}`}
                    label={t('archive.unarchive')}
                    variant="secondary"
                    onPress={() => {
                      setFormError(null);
                      setConfirmId(item.id);
                    }}
                  />
                )}
              </View>
            </View>
          )}
        />
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  body: { flex: 1, gap: Spacing.two },
  padded: { paddingHorizontal: Spacing.four, gap: Spacing.two },
  list: { paddingBottom: Spacing.five },
  meta: { paddingHorizontal: Spacing.four, paddingBottom: Spacing.three, gap: Spacing.one },
  confirm: { gap: Spacing.two, paddingTop: Spacing.two },
});
