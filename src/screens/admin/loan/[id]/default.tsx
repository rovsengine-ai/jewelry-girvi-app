/**
 * Owner-only forfeiture. Overdue-ness is decided by loans_overdue_as_of
 * (via fetchOverdueLoans on the detail screen). This screen does not compare dates.
 *
 * Expo Router nested stack (SDK 57):
 * https://docs.expo.dev/versions/v57.0.0/sdk/router/
 */
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { EmptyState } from '@/components/empty-state';
import { Field } from '@/components/field';
import { FormNotice } from '@/components/form-notice';
import { ListSkeleton } from '@/components/list-row-skeleton';
import { MoneyText } from '@/components/money-text';
import { Row } from '@/components/row';
import { ScreenHeader } from '@/components/screen-header';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { asPaise, formatPaiseAsInr, todayInKolkata } from '@/lib/money';
import { loanStatusLabel, parseOwnerOnlyError, redeemGate } from '@/lib/redemption';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/providers/auth-provider';
import { useLanguage } from '@/providers/language-provider';
import { defaultLoan, fetchLoanBalances } from '@/services/loanService';
import type { LoanBalances, LoanWithCustomer } from '@/types/database';

export default function DefaultLoanScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { profile } = useAuth();
  const { t, language } = useLanguage();

  const [loan, setLoan] = useState<LoanWithCustomer | null>(null);
  const [balances, setBalances] = useState<LoanBalances | null>(null);
  const [reason, setReason] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [doneNotice, setDoneNotice] = useState<string | null>(null);

  const gate = redeemGate(profile?.role, loan?.status);
  const reasonReady = reason.trim() !== '';
  const headerTitle = loan
    ? t('loans.default.title', { serial: loan.serial_number })
    : t('loans.detail.defaultLoan');

  useEffect(() => {
    if (!id) return;
    void (async () => {
      setIsLoading(true);
      setLoadError(null);
      try {
        const { data, error } = await supabase
          .from('loans')
          .select(
            `
            *,
            profiles:customer_id ( full_name, phone_number, address, role )
          `,
          )
          .eq('id', id)
          .maybeSingle();
        if (error) {
          throw new Error(error.message);
        }
        const nextLoan = data as LoanWithCustomer | null;
        setLoan(nextLoan);
        if (!nextLoan) {
          setBalances(null);
          return;
        }
        setBalances(await fetchLoanBalances(id, todayInKolkata()));
      } catch (error) {
        setLoadError(error instanceof Error ? error.message : t('errors.failedLoadLoan'));
      } finally {
        setIsLoading(false);
      }
    })();
  }, [id, t]);

  const handleDefault = async () => {
    if (!id || !reasonReady) return;
    setFormError(null);
    setIsSaving(true);
    try {
      const result = await defaultLoan({
        loanId: id,
        defaultedOn: todayInKolkata(),
        reason: reason.trim(),
      });
      setDoneNotice(
        t('loans.default.successBody', {
          amount: formatPaiseAsInr(asPaise(result.default_balance_paise)),
          date: result.defaulted_on,
        }),
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : t('errors.unknown');
      if (parseOwnerOnlyError(message)) {
        setFormError(t('loans.default.ownerOnlyError'));
      } else {
        setFormError(message);
      }
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <ThemedView style={styles.container} type="surfaceSunken">
        <ScreenHeader showBack title={t('loans.detail.defaultLoan')} />
        <ListSkeleton rows={6} />
      </ThemedView>
    );
  }

  if (loadError) {
    return (
      <ThemedView style={styles.container}>
        <ScreenHeader showBack title={t('loans.detail.defaultLoan')} />
        <View style={styles.body}>
          <Button label={t('common.back')} variant="secondary" onPress={() => router.back()} />
          <EmptyState title={t('loans.detail.loadErrorTitle')} body={loadError} />
        </View>
      </ThemedView>
    );
  }

  if (doneNotice) {
    return (
      <ThemedView style={styles.container}>
        <ScreenHeader showBack title={t('loans.default.successTitle')} />
        <View style={styles.body}>
          <EmptyState
            title={t('loans.default.successTitle')}
            body={doneNotice}
            actionLabel={t('common.backToLoan')}
            onAction={() => router.replace(`/(admin)/loan/${id}`)}
          />
        </View>
      </ThemedView>
    );
  }

  if (gate.kind === 'owner_only') {
    return (
      <ThemedView style={styles.container}>
        <ScreenHeader showBack title={t('loans.default.ownerOnlyTitle')} />
        <View style={styles.body}>
          <Button label={t('common.back')} variant="secondary" onPress={() => router.back()} />
          <EmptyState
            title={t('loans.default.ownerOnlyTitle')}
            body={t('loans.default.ownerOnlyBody')}
          />
        </View>
      </ThemedView>
    );
  }

  if (!loan || !balances) {
    return (
      <ThemedView style={styles.container}>
        <ScreenHeader showBack title={t('loans.detail.defaultLoan')} />
        <View style={styles.body}>
          <Button label={t('common.back')} variant="secondary" onPress={() => router.back()} />
          <EmptyState title={t('loans.detail.notFoundTitle')} body={t('loans.detail.notFoundBody')} />
        </View>
      </ThemedView>
    );
  }

  if (loan.status === 'defaulted') {
    return (
      <ThemedView style={styles.container}>
        <ScreenHeader showBack title={t('loans.default.alreadyTitle')} />
        <View style={styles.body}>
          <Button label={t('common.back')} variant="secondary" onPress={() => router.back()} />
          <ThemedText type="small">
            {t('loans.default.alreadyOn', { date: loan.defaulted_on ?? t('common.emDash') })}
          </ThemedText>
          {loan.default_balance_paise != null ? (
            <MoneyText paise={asPaise(loan.default_balance_paise)} />
          ) : null}
        </View>
      </ThemedView>
    );
  }

  if (gate.kind === 'not_active' || gate.kind === 'already_redeemed') {
    return (
      <ThemedView style={styles.container}>
        <ScreenHeader showBack title={t('loans.default.cannotTitle')} />
        <View style={styles.body}>
          <Button label={t('common.back')} variant="secondary" onPress={() => router.back()} />
          <ThemedText>
            {t('loans.default.cannotBody', { status: loanStatusLabel(loan.status, language) })}
          </ThemedText>
        </View>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <ScreenHeader showBack title={headerTitle} />
      <ScrollView contentContainerStyle={styles.scroll}>
        <Button label={t('common.back')} variant="secondary" onPress={() => router.back()} />
        <ThemedText type="small">{loan.profiles?.full_name ?? t('common.unknownCustomer')}</ThemedText>
        <FormNotice error={formError} />

        <Card>
          <ThemedText type="smallBold">{t('loans.default.balancesTitle')}</ThemedText>
          <Row>
            <ThemedText type="small">{t('loans.default.totalDue')}</ThemedText>
            <MoneyText paise={balances.totalDuePaise} />
          </Row>
          <ThemedText type="small">{t('loans.default.balancesHint')}</ThemedText>
        </Card>

        <Card>
          <ThemedText type="smallBold">{t('loans.default.reasonTitle')}</ThemedText>
          <ThemedText type="small">{t('loans.default.reasonHint')}</ThemedText>
          <Field
            label={t('loans.default.reasonLabel')}
            value={reason}
            onChangeText={setReason}
            testID="default-reason"
          />
        </Card>

        <Button
          testID="confirm-default"
          label={t('loans.default.confirm')}
          variant="danger"
          disabled={!reasonReady}
          loading={isSaving}
          requiresNetwork
          onPress={() => void handleDefault()}
        />
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  body: { flex: 1, paddingHorizontal: Spacing.four, gap: Spacing.two },
  scroll: { paddingHorizontal: Spacing.four, paddingBottom: Spacing.five, gap: Spacing.three },
});
