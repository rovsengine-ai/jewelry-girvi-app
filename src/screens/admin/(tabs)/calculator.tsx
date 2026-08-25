/**
 * Shop payoff quote. Owner and staff only — customers never reach this tab.
 * Interest is computed in SQL by quote_loan_payoff, not in this screen.
 *
 * Expo Router (SDK 57): https://docs.expo.dev/versions/v57.0.0/sdk/router/
 * Tabs: https://docs.expo.dev/router/advanced/tabs/
 * Symbols: https://docs.expo.dev/versions/v57.0.0/sdk/symbols/
 */
import { useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';

import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { Field } from '@/components/field';
import { FilterChip } from '@/components/filter-chip';
import { FormNotice } from '@/components/form-notice';
import { ListRow } from '@/components/list-row';
import { ListSkeleton } from '@/components/list-row-skeleton';
import { MoneyText } from '@/components/money-text';
import { ScreenHeader } from '@/components/screen-header';
import { SectionLabel } from '@/components/section-label';
import { SettingsGroup } from '@/components/settings-group';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Radii, Spacing } from '@/constants/theme';
import { useTabBarScrollPadding } from '@/hooks/use-tab-bar-scroll-padding';
import { useTheme } from '@/hooks/use-theme';
import { unknownMessage, type TranslateFn } from '@/i18n';
import { formatBpsAsPercent, rupeesInputToPaise, todayInKolkata } from '@/lib/money';
import { ADMIN_LOANS_HREF, isShopUser } from '@/lib/shop-tab-access';
import { useAuth } from '@/providers/auth-provider';
import { useLanguage } from '@/providers/language-provider';
import { quoteLoanPayoff } from '@/services/loanService';
import type { InterestModel, QuoteLoanPayoff, QuotePayoffWhy } from '@/types/database';

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function parseCalculatorIsoDate(raw: string): string | null {
  const trimmed = raw.trim();
  if (!ISO_DATE_RE.test(trimmed)) return null;
  const [year, month, day] = trimmed.split('-').map((part) => Number.parseInt(part, 10));
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    return null;
  }
  return trimmed;
}

function quoteWhyMessage(why: QuotePayoffWhy, t: TranslateFn): string {
  switch (why) {
    case 'same_day':
      return t('calculator.why.sameDay');
    case 'first_month_floor':
      return t('calculator.why.firstMonthFloor');
    case 'remainder_round_up':
      return t('calculator.why.remainderRoundUp');
    case 'exact_periods':
      return t('calculator.why.exactPeriods');
    case 'pro_rata_remainder':
      return t('calculator.why.proRataRemainder');
    case 'full_period':
      return t('calculator.why.fullPeriod');
    case 'merchant_per_day':
      return t('calculator.why.merchantPerDay');
    case 'compounded':
      return t('calculator.why.compounded');
    default: {
      const _exhaustive: never = why;
      return _exhaustive;
    }
  }
}

export default function ShopCalculatorScreen() {
  const router = useRouter();
  const colors = useTheme();
  const { profile, isLoading: authLoading } = useAuth();
  const { t } = useLanguage();
  const tabBarPadding = useTabBarScrollPadding();
  const [amountRupees, setAmountRupees] = useState('');
  const [pledgeDate, setPledgeDate] = useState(todayInKolkata);
  const [payOn, setPayOn] = useState(todayInKolkata);
  const [interestModel, setInterestModel] = useState<InterestModel>('retail');
  const [quote, setQuote] = useState<QuoteLoanPayoff | null>(null);
  const [isQuoting, setIsQuoting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const formRef = useRef({ amountRupees, pledgeDate, payOn, interestModel });
  formRef.current = { amountRupees, pledgeDate, payOn, interestModel };

  const shopUser = isShopUser(profile?.role);

  useEffect(() => {
    if (authLoading) return;
    if (!shopUser) {
      router.replace(ADMIN_LOANS_HREF);
    }
  }, [authLoading, shopUser, router]);

  if (authLoading || !shopUser) {
    return (
      <ThemedView style={styles.container} type="surfaceSunken">
        <ListSkeleton rows={4} />
      </ThemedView>
    );
  }

  const onCalculate = async () => {
    setFormError(null);
    setQuote(null);
    const form = formRef.current;
    const disbursedOn = parseCalculatorIsoDate(form.pledgeDate);
    const asOf = parseCalculatorIsoDate(form.payOn);
    if (!disbursedOn) {
      setFormError(t('calculator.invalidDate', { field: t('calculator.pledgeDate') }));
      return;
    }
    if (!asOf) {
      setFormError(t('calculator.invalidDate', { field: t('calculator.payOn') }));
      return;
    }
    if (asOf < disbursedOn) {
      setFormError(t('calculator.payOnBeforePledge'));
      return;
    }

    let principalPaise: number;
    try {
      principalPaise = rupeesInputToPaise(form.amountRupees);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : t('errors.unknown'));
      return;
    }

    setIsQuoting(true);
    try {
      const next = await quoteLoanPayoff({
        principalPaise,
        disbursedOn,
        asOf,
        interestModel: form.interestModel,
      });
      setQuote(next);
    } catch (err) {
      setFormError(unknownMessage(err, t));
    } finally {
      setIsQuoting(false);
    }
  };

  const goldHero = quote ? (
    <View style={[styles.goldPill, { backgroundColor: colors.gold }]}>
      <View style={styles.goldCopy}>
        <ThemedText type="overline" style={{ color: colors.onGold }}>
          {t('calculator.resultTitle')}
        </ThemedText>
        <MoneyText size="large" paise={quote.totalDuePaise} style={{ color: colors.onGold }} />
      </View>
    </View>
  ) : null;

  return (
    <ThemedView style={styles.container} type="surfaceSunken">
      <ScreenHeader
        title={t('calculator.title')}
        subtitle={t('calculator.subtitle')}
        hero={goldHero}
      />
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[styles.scroll, { paddingBottom: tabBarPadding }]}>
        <SectionLabel>{t('calculator.inputs')}</SectionLabel>
        <Card style={styles.formCard}>
          <Field
            label={t('calculator.amount')}
            value={amountRupees}
            onChangeText={setAmountRupees}
            keyboardType="numeric"
            placeholder={t('calculator.amountPlaceholder')}
            testID="calculator-amount"
          />
          <Field
            label={t('calculator.pledgeDate')}
            value={pledgeDate}
            onChangeText={setPledgeDate}
            autoCapitalize="none"
            autoCorrect={false}
            testID="calculator-pledge-date"
          />
          <Field
            label={t('calculator.payOn')}
            value={payOn}
            onChangeText={setPayOn}
            autoCapitalize="none"
            autoCorrect={false}
            testID="calculator-pay-on"
          />
          <ThemedText type="smallBold">{t('loans.scanner.customerType')}</ThemedText>
          <View style={styles.modelRow}>
            <FilterChip
              label={t('loans.interestModel.retail')}
              selected={interestModel === 'retail'}
              onPress={() => setInterestModel('retail')}
              testID="calculator-model-retail"
            />
            <FilterChip
              label={t('loans.interestModel.merchant')}
              selected={interestModel === 'merchant'}
              onPress={() => setInterestModel('merchant')}
              testID="calculator-model-merchant"
            />
          </View>
          <Button
            testID="calculator-submit"
            label={t('calculator.calculate')}
            loading={isQuoting}
            requiresNetwork
            onPress={() => void onCalculate()}
          />
        </Card>

        <FormNotice error={formError} />

        {quote ? (
          <>
            <SectionLabel>{t('calculator.breakdown')}</SectionLabel>
            <SettingsGroup>
              <ListRow
                content={
                  <ThemedText type="bodyLarge">{t('calculator.principal')}</ThemedText>
                }
                trailing={<MoneyText paise={quote.principalPaise} />}
              />
              <ListRow
                content={<ThemedText type="bodyLarge">{t('calculator.interest')}</ThemedText>}
                trailing={<MoneyText paise={quote.accruedInterestPaise} />}
              />
              <ListRow
                isLast
                content={<ThemedText type="bodyBold">{t('calculator.total')}</ThemedText>}
                trailing={<MoneyText paise={quote.totalDuePaise} />}
              />
            </SettingsGroup>

            <SectionLabel>{t('calculator.detail')}</SectionLabel>
            <SettingsGroup>
              <ListRow
                content={<ThemedText type="bodyLarge">{t('calculator.days')}</ThemedText>}
                trailing={
                  <ThemedText type="bodyLarge">{String(quote.daysElapsed)}</ThemedText>
                }
              />
              <ListRow
                content={<ThemedText type="bodyLarge">{t('calculator.months')}</ThemedText>}
                trailing={
                  <ThemedText type="bodyLarge">
                    {t('calculator.monthsValue', {
                      complete: quote.completePeriods,
                      remainder: quote.remainderDays,
                    })}
                  </ThemedText>
                }
              />
              <ListRow
                content={
                  <ThemedText type="bodyLarge">{t('calculator.oneMonthInterest')}</ThemedText>
                }
                trailing={<MoneyText paise={quote.periodInterestPaise} />}
              />
              <ListRow
                content={<ThemedText type="bodyLarge">{t('calculator.rateUsed')}</ThemedText>}
                trailing={
                  <ThemedText type="bodyLarge">
                    {t('calculator.rateValue', { rate: formatBpsAsPercent(quote.rateBps) })}
                  </ThemedText>
                }
              />
              <ListRow
                isLast
                content={<ThemedText type="bodyLarge">{t('calculator.model')}</ThemedText>}
                trailing={
                  <ThemedText type="bodyLarge">
                    {quote.interestModel === 'retail'
                      ? t('loans.interestModel.retail')
                      : t('loans.interestModel.merchant')}
                  </ThemedText>
                }
              />
            </SettingsGroup>
            <View style={styles.why}>
              <FormNotice info={quoteWhyMessage(quote.why, t)} />
            </View>
          </>
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
  formCard: {
    marginHorizontal: Spacing.four,
  },
  modelRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.one,
  },
  goldPill: {
    marginHorizontal: Spacing.three,
    marginBottom: Spacing.three,
    borderRadius: Radii.md,
    padding: Spacing.three,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  goldCopy: {
    flex: 1,
    minWidth: 0,
    gap: Spacing.half,
  },
  why: {
    paddingHorizontal: Spacing.four,
  },
});
