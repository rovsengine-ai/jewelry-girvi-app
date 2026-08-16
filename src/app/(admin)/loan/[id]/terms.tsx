/**
 * Owner-only per-loan term edit. Writes terms and loan_term_changes in one RPC.
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
import { FilterChip } from '@/components/filter-chip';
import { FormNotice } from '@/components/form-notice';
import { ListSkeleton } from '@/components/list-row-skeleton';
import { ScreenHeader } from '@/components/screen-header';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import type { TranslateFn } from '@/i18n';
import { formatBpsAsPercent, percentInputToBps } from '@/lib/money';
import { parseOwnerOnlyError } from '@/lib/redemption';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/providers/auth-provider';
import { useLanguage } from '@/providers/language-provider';
import { editLoanTerms } from '@/services/loanService';
import type { InterestModel, LoanWithCustomer, PartialPeriodMode } from '@/types/database';

const MODE_KEYS: Record<PartialPeriodMode, string> = {
  min_month_then_pro_rata: 'loans.terms.minMonthThenProRata',
  full_period: 'loans.terms.fullPeriod',
  pro_rata: 'loans.terms.proRata',
};

const MODEL_KEYS: Record<InterestModel, string> = {
  retail: 'loans.interestModel.retail',
  merchant: 'loans.interestModel.merchant',
};

function parseWholeNumber(raw: string, field: string, t: TranslateFn): number {
  const trimmed = raw.trim();
  if (!/^\d+$/.test(trimmed)) {
    throw new Error(t('errors.wholeNumber', { field }));
  }
  return Number.parseInt(trimmed, 10);
}

export default function EditLoanTermsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { profile } = useAuth();
  const { t } = useLanguage();

  const [loan, setLoan] = useState<LoanWithCustomer | null>(null);
  const [ratePercent, setRatePercent] = useState('');
  const [simplePeriodDays, setSimplePeriodDays] = useState('');
  const [compoundEveryDays, setCompoundEveryDays] = useState('');
  const [graceDays, setGraceDays] = useState('');
  const [roundUpThresholdDays, setRoundUpThresholdDays] = useState('');
  const [partialPeriodMode, setPartialPeriodMode] =
    useState<PartialPeriodMode>('min_month_then_pro_rata');
  const [interestModel, setInterestModel] = useState<InterestModel>('retail');
  const [reason, setReason] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [formNotice, setFormNotice] = useState<string | null>(null);

  const isOwner = profile?.role === 'owner';
  const reasonReady = reason.trim() !== '';
  const headerTitle = loan
    ? t('loans.terms.editTitle', { serial: loan.serial_number })
    : t('loans.detail.editTerms');

  useEffect(() => {
    if (profile?.role && profile.role !== 'owner') {
      router.replace(`/(admin)/loan/${id}`);
    }
  }, [id, profile?.role, router]);

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
        if (!nextLoan) return;
        setRatePercent(formatBpsAsPercent(nextLoan.rate_bps));
        setSimplePeriodDays(String(nextLoan.simple_period_days));
        setCompoundEveryDays(String(nextLoan.compound_every_days));
        setGraceDays(String(nextLoan.grace_days));
        setRoundUpThresholdDays(String(nextLoan.round_up_threshold_days));
        setPartialPeriodMode(nextLoan.partial_period_mode);
        setInterestModel(nextLoan.interest_model);
      } catch (error) {
        setLoadError(error instanceof Error ? error.message : t('errors.failedLoadLoan'));
      } finally {
        setIsLoading(false);
      }
    })();
  }, [id, t]);

  const handleSave = async () => {
    if (!id || !reasonReady) return;
    setFormError(null);
    setFormNotice(null);
    setIsSaving(true);
    try {
      const result = await editLoanTerms({
        loanId: id,
        rateBps: percentInputToBps(ratePercent),
        interestModel,
        simplePeriodDays: parseWholeNumber(simplePeriodDays, t('loans.terms.simplePeriod'), t),
        compoundEveryDays: parseWholeNumber(compoundEveryDays, t('loans.terms.compoundEvery'), t),
        graceDays: parseWholeNumber(graceDays, t('loans.terms.graceDays'), t),
        partialPeriodMode,
        roundUpThresholdDays: parseWholeNumber(
          roundUpThresholdDays,
          t('loans.terms.roundUpThreshold'),
          t,
        ),
        reason: reason.trim(),
      });
      setFormNotice(t('loans.terms.saved', { count: result.change_count }));
    } catch (error) {
      const message = error instanceof Error ? error.message : t('errors.unknown');
      if (parseOwnerOnlyError(message)) {
        setFormError(t('loans.terms.ownerOnly'));
      } else {
        setFormError(message);
      }
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOwner) {
    return (
      <ThemedView style={styles.container} type="surfaceSunken">
        <ScreenHeader showBack title={t('loans.detail.editTerms')} />
        <ListSkeleton rows={6} />
      </ThemedView>
    );
  }

  if (isLoading) {
    return (
      <ThemedView style={styles.container} type="surfaceSunken">
        <ScreenHeader showBack title={t('loans.detail.editTerms')} />
        <ListSkeleton rows={6} />
      </ThemedView>
    );
  }

  if (loadError) {
    return (
      <ThemedView style={styles.container}>
        <ScreenHeader showBack title={t('loans.detail.editTerms')} />
        <View style={styles.body}>
          <Button label={t('common.back')} variant="secondary" onPress={() => router.back()} />
          <EmptyState title={t('loans.detail.loadErrorTitle')} body={loadError} />
        </View>
      </ThemedView>
    );
  }

  if (!loan) {
    return (
      <ThemedView style={styles.container}>
        <ScreenHeader showBack title={t('loans.detail.editTerms')} />
        <View style={styles.body}>
          <Button label={t('common.back')} variant="secondary" onPress={() => router.back()} />
          <EmptyState title={t('loans.detail.notFoundTitle')} body={t('loans.detail.notFoundBody')} />
        </View>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <ScreenHeader showBack title={headerTitle} />
      <ScrollView contentContainerStyle={styles.scroll}>
        <Button label={t('common.back')} variant="secondary" onPress={() => router.back()} />
        <FormNotice error={formError} notice={formNotice} />
        <ThemedText type="small">{t('loans.terms.auditHint')}</ThemedText>

        <Card>
          <ThemedText type="smallBold">{t('loans.terms.interestModel')}</ThemedText>
          <View style={styles.modeRow}>
            {(Object.keys(MODEL_KEYS) as InterestModel[]).map((id) => (
              <FilterChip
                key={id}
                label={t(MODEL_KEYS[id])}
                selected={interestModel === id}
                onPress={() => setInterestModel(id)}
              />
            ))}
          </View>
          <Field
            label={t('loans.terms.rateLabel')}
            value={ratePercent}
            onChangeText={setRatePercent}
            keyboardType="decimal-pad"
          />
          <Field
            label={t('loans.terms.simplePeriod')}
            value={simplePeriodDays}
            onChangeText={setSimplePeriodDays}
            keyboardType="number-pad"
          />
          <Field
            label={t('loans.terms.compoundEvery')}
            value={compoundEveryDays}
            onChangeText={setCompoundEveryDays}
            keyboardType="number-pad"
          />
          <Field
            label={t('loans.terms.graceDays')}
            value={graceDays}
            onChangeText={setGraceDays}
            keyboardType="number-pad"
          />
          <Field
            label={t('loans.terms.roundUpThreshold')}
            value={roundUpThresholdDays}
            onChangeText={setRoundUpThresholdDays}
            keyboardType="number-pad"
          />
          <ThemedText type="smallBold">{t('loans.terms.partialPeriodMode')}</ThemedText>
          <View style={styles.modeRow}>
            {(Object.keys(MODE_KEYS) as PartialPeriodMode[]).map((id) => (
              <FilterChip
                key={id}
                label={t(MODE_KEYS[id])}
                selected={partialPeriodMode === id}
                onPress={() => setPartialPeriodMode(id)}
              />
            ))}
          </View>
          <Field
            label={t('loans.terms.reason')}
            value={reason}
            onChangeText={setReason}
            testID="term-reason"
          />
        </Card>

        <Button
          testID="save-loan-terms"
          label={t('loans.terms.save')}
          disabled={!reasonReady}
          loading={isSaving}
          onPress={() => void handleSave()}
        />
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  body: { flex: 1, paddingHorizontal: Spacing.four, gap: Spacing.two },
  scroll: { paddingHorizontal: Spacing.four, paddingBottom: Spacing.five, gap: Spacing.three },
  modeRow: { gap: Spacing.two, flexDirection: 'row', flexWrap: 'wrap' },
});
