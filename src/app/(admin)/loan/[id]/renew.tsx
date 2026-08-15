import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { EmptyState } from '@/components/empty-state';
import { Field } from '@/components/field';
import { FormNotice } from '@/components/form-notice';
import { MoneyText } from '@/components/money-text';
import { Row } from '@/components/row';
import { ScreenHeader } from '@/components/screen-header';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { asPaise, formatPaiseAsInr, todayInKolkata } from '@/lib/money';
import {
  defaultNewMaturityOn,
  isRenewalEligible,
  parseOwnerOnlyError,
  redeemGate,
} from '@/lib/redemption';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/providers/auth-provider';
import { useLanguage } from '@/providers/language-provider';
import { fetchLatestMaturityOn, fetchLoanBalances, renewLoan } from '@/services/loanService';
import type { LoanBalances, LoanWithCustomer } from '@/types/database';

export default function RenewLoanScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { profile } = useAuth();
  const { t } = useLanguage();

  const [loan, setLoan] = useState<LoanWithCustomer | null>(null);
  const [balances, setBalances] = useState<LoanBalances | null>(null);
  const [latestMaturityOn, setLatestMaturityOn] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [doneNotice, setDoneNotice] = useState<string | null>(null);

  const asOf = todayInKolkata();
  const gate = redeemGate(profile?.role, loan?.status);
  const headerTitle = loan
    ? t('renew.title', { serial: loan.serial_number })
    : t('loans.detail.renew');

  const load = useCallback(async () => {
    if (!id) return;
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
    const [nextBalances, maturity] = await Promise.all([
      fetchLoanBalances(id, asOf),
      fetchLatestMaturityOn(id),
    ]);
    setBalances(nextBalances);
    setLatestMaturityOn(maturity);
  }, [id, asOf]);

  useEffect(() => {
    void (async () => {
      setIsLoading(true);
      setLoadError(null);
      try {
        await load();
      } catch (error) {
        setLoadError(error instanceof Error ? error.message : t('errors.failedLoadLoan'));
      } finally {
        setIsLoading(false);
      }
    })();
  }, [load, t]);

  const handleRenew = async () => {
    if (!id || !loan || !balances) return;
    setFormError(null);
    const newMaturityOn = defaultNewMaturityOn(asOf, loan.simple_period_days);

    setIsSaving(true);
    try {
      const result = await renewLoan({
        loanId: id,
        renewedOn: asOf,
        interestPaidPaise: balances.accruedInterestPaise,
        newMaturityOn,
        note: note.trim() || null,
      });
      setDoneNotice(
        t('renew.successBody', {
          amount: formatPaiseAsInr(asPaise(result.interest_paid_paise)),
          date: result.new_maturity_on,
        }),
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : t('errors.unknown');
      if (parseOwnerOnlyError(message)) {
        setFormError(t('renew.ownerOnlyError'));
      } else {
        setFormError(message);
      }
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <ThemedView style={styles.centered}>
        <ActivityIndicator />
      </ThemedView>
    );
  }

  if (loadError) {
    return (
      <ThemedView style={styles.container}>
        <ScreenHeader title={t('loans.detail.renew')} />
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
        <ScreenHeader title={t('renew.successTitle')} />
        <View style={styles.body}>
          <EmptyState
            title={t('renew.successTitle')}
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
        <ScreenHeader title={t('renew.ownerOnlyTitle')} />
        <View style={styles.body}>
          <Button label={t('common.back')} variant="secondary" onPress={() => router.back()} />
          <EmptyState title={t('renew.ownerOnlyTitle')} body={t('renew.ownerOnlyBody')} />
        </View>
      </ThemedView>
    );
  }

  if (!loan || !balances) {
    return (
      <ThemedView style={styles.container}>
        <ScreenHeader title={t('loans.detail.renew')} />
        <View style={styles.body}>
          <Button label={t('common.back')} variant="secondary" onPress={() => router.back()} />
          <EmptyState title={t('loans.detail.notFoundTitle')} body={t('loans.detail.notFoundBody')} />
        </View>
      </ThemedView>
    );
  }

  const eligible = isRenewalEligible(
    loan.disbursed_on,
    loan.simple_period_days,
    asOf,
    latestMaturityOn,
  );

  return (
    <ThemedView style={styles.container}>
      <ScreenHeader title={headerTitle} />
      <ScrollView contentContainerStyle={styles.scroll}>
        <Button label={t('common.back')} variant="secondary" onPress={() => router.back()} />
        <ThemedText type="small">{loan.profiles?.full_name ?? t('common.unknownCustomer')}</ThemedText>
        <FormNotice error={formError} />

        <Card>
          <ThemedText type="smallBold">{t('renew.interestOnly')}</ThemedText>
          <Row>
            <ThemedText type="small">{t('renew.accruedInterestDue')}</ThemedText>
            <MoneyText paise={balances.accruedInterestPaise} />
          </Row>
          <Row>
            <ThemedText type="small">{t('renew.principalStays')}</ThemedText>
            <MoneyText paise={balances.outstandingPrincipalPaise} />
          </Row>
          <ThemedText type="small">
            {t('renew.newDueDate', { date: defaultNewMaturityOn(asOf, loan.simple_period_days) })}
          </ThemedText>
          <Field label={t('renew.optionalNote')} value={note} onChangeText={setNote} />
        </Card>

        {!eligible ? (
          <ThemedText>
            {latestMaturityOn
              ? t('renew.notEligibleWithDue', {
                  days: loan.simple_period_days,
                  date: latestMaturityOn,
                })
              : t('renew.notEligible', { days: loan.simple_period_days })}
          </ThemedText>
        ) : (
          <Button
            testID="confirm-renew"
            label={t('renew.confirm')}
            loading={isSaving}
            onPress={() => void handleRenew()}
          />
        )}
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  body: { flex: 1, paddingHorizontal: Spacing.four, gap: Spacing.two },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  scroll: { paddingHorizontal: Spacing.four, paddingBottom: Spacing.five, gap: Spacing.three },
});
