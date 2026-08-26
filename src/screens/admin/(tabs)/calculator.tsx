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
import { readPracticeMode } from '@/lib/practice-mode';
import { ADMIN_LOANS_HREF, isShopUser } from '@/lib/shop-tab-access';
import { useAuth } from '@/providers/auth-provider';
import { useLanguage } from '@/providers/language-provider';
import { quoteLoanPayoff } from '@/services/loanService';
import type { InterestModel, QuoteLoanPayoff, QuotePayoffWhy } from '@/types/database';

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
type CalculatorMode = 'payoff' | 'interest' | 'age';
type InterestCalcMode = 'simple' | 'compound';
type InterestRateType = 'percent' | 'rupees';
type InterestDurationMode = 'dates' | 'duration';

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

function toUtcDate(isoDate: string): Date {
  const [year, month, day] = isoDate.split('-').map((part) => Number.parseInt(part, 10));
  return new Date(Date.UTC(year, month - 1, day));
}

function utcDiffDays(fromIso: string, toIso: string): number {
  const from = toUtcDate(fromIso).getTime();
  const to = toUtcDate(toIso).getTime();
  return Math.floor((to - from) / (24 * 60 * 60 * 1000));
}

function parsePositiveNumber(raw: string): number | null {
  const value = Number(raw.trim());
  if (!Number.isFinite(value) || value <= 0) return null;
  return value;
}

function parseNonNegativeInt(raw: string): number | null {
  if (!/^\d+$/.test(raw.trim())) return null;
  const value = Number.parseInt(raw.trim(), 10);
  if (!Number.isFinite(value) || value < 0) return null;
  return value;
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
  const [mode, setMode] = useState<CalculatorMode>('payoff');
  const [amountRupees, setAmountRupees] = useState('');
  const [pledgeDate, setPledgeDate] = useState(todayInKolkata);
  const [payOn, setPayOn] = useState(todayInKolkata);
  const [interestModel, setInterestModel] = useState<InterestModel>('retail');
  const [quote, setQuote] = useState<QuoteLoanPayoff | null>(null);
  const [isQuoting, setIsQuoting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const formRef = useRef({ amountRupees, pledgeDate, payOn, interestModel });
  formRef.current = { amountRupees, pledgeDate, payOn, interestModel };
  const [interestAmount, setInterestAmount] = useState('');
  const [interestRate, setInterestRate] = useState('');
  const [interestRateType, setInterestRateType] = useState<InterestRateType>('rupees');
  const [interestCalcMode, setInterestCalcMode] = useState<InterestCalcMode>('simple');
  const [interestDurationMode, setInterestDurationMode] = useState<InterestDurationMode>('dates');
  const [interestFromDate, setInterestFromDate] = useState(todayInKolkata);
  const [interestToDate, setInterestToDate] = useState(todayInKolkata);
  const [interestDurationDays, setInterestDurationDays] = useState('');
  const [interestResult, setInterestResult] = useState<{
    days: number;
    interestRupees: number;
    totalRupees: number;
  } | null>(null);
  const [ageDob, setAgeDob] = useState('');
  const [ageResult, setAgeResult] = useState<{
    years: number;
    months: number;
    days: number;
    nextBirthdayMonths: number;
    nextBirthdayDays: number;
    totalDays: number;
  } | null>(null);
  const [practiceMode, setPracticeMode] = useState(false);

  const shopUser = isShopUser(profile?.role);

  useEffect(() => {
    void readPracticeMode().then(setPracticeMode).catch(() => setPracticeMode(false));
  }, []);

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
      const next = practiceMode
        ? (() => {
            const days = utcDiffDays(disbursedOn, asOf);
            const rateBps = form.interestModel === 'merchant' ? 300 : 300;
            const periodInterestPaise = Math.round((principalPaise * rateBps) / 10000);
            const accruedInterestPaise = Math.round((periodInterestPaise * days) / 30);
            return {
              principalPaise,
              accruedInterestPaise,
              totalDuePaise: principalPaise + accruedInterestPaise,
              daysElapsed: days,
              completePeriods: Math.floor(days / 30),
              remainderDays: days % 30,
              remainderRoundedUp: false,
              firstMonthFloorApplied: false,
              capitalized: false,
              periodInterestPaise,
              rateBps,
              interestModel: form.interestModel,
              partialPeriodMode: 'pro_rata' as const,
              roundUpThresholdDays: 15,
              simplePeriodDays: 90,
              disbursedOn,
              asOf,
              why: 'pro_rata_remainder' as const,
            } satisfies QuoteLoanPayoff;
          })()
        : await quoteLoanPayoff({
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

  const clearInterest = () => {
    setInterestAmount('');
    setInterestRate('');
    setInterestRateType('rupees');
    setInterestCalcMode('simple');
    setInterestDurationMode('dates');
    setInterestFromDate(todayInKolkata);
    setInterestToDate(todayInKolkata);
    setInterestDurationDays('');
    setInterestResult(null);
    setFormError(null);
  };

  const calculateInterest = () => {
    setFormError(null);
    setInterestResult(null);
    const principal = parsePositiveNumber(interestAmount);
    if (!principal) {
      setFormError(t('calculator.interestCalc.invalidAmount'));
      return;
    }
    const rateValue = parsePositiveNumber(interestRate);
    if (!rateValue) {
      setFormError(t('calculator.interestCalc.invalidRate'));
      return;
    }

    let days = 0;
    if (interestDurationMode === 'dates') {
      const fromIso = parseCalculatorIsoDate(interestFromDate);
      const toIso = parseCalculatorIsoDate(interestToDate);
      if (!fromIso || !toIso) {
        setFormError(t('calculator.interestCalc.invalidDates'));
        return;
      }
      days = utcDiffDays(fromIso, toIso);
      if (days < 0) {
        setFormError(t('calculator.interestCalc.toBeforeFrom'));
        return;
      }
    } else {
      const parsedDays = parseNonNegativeInt(interestDurationDays);
      if (parsedDays === null) {
        setFormError(t('calculator.interestCalc.invalidDuration'));
        return;
      }
      days = parsedDays;
    }

    const monthlyRate = interestRateType === 'percent' ? rateValue / 100 : rateValue / principal;
    const dailyRate = monthlyRate / 30;
    const interest =
      interestCalcMode === 'compound'
        ? principal * (Math.pow(1 + dailyRate, days) - 1)
        : principal * dailyRate * days;
    const total = principal + interest;
    setInterestResult({
      days,
      interestRupees: Math.max(0, interest),
      totalRupees: Math.max(0, total),
    });
  };

  const clearAge = () => {
    setAgeDob('');
    setAgeResult(null);
    setFormError(null);
  };

  const calculateAge = () => {
    setFormError(null);
    setAgeResult(null);
    const dobIso = parseCalculatorIsoDate(ageDob);
    if (!dobIso) {
      setFormError(t('calculator.ageCalc.invalidDob'));
      return;
    }
    const todayIso = todayInKolkata();
    if (dobIso > todayIso) {
      setFormError(t('calculator.ageCalc.futureDob'));
      return;
    }
    const dob = toUtcDate(dobIso);
    const today = toUtcDate(todayIso);
    let years = today.getUTCFullYear() - dob.getUTCFullYear();
    let months = today.getUTCMonth() - dob.getUTCMonth();
    let days = today.getUTCDate() - dob.getUTCDate();
    if (days < 0) {
      months -= 1;
      const previousMonthEnd = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 0));
      days += previousMonthEnd.getUTCDate();
    }
    if (months < 0) {
      years -= 1;
      months += 12;
    }

    let nextBirthdayYear = today.getUTCFullYear();
    const birthdayThisYear = new Date(
      Date.UTC(nextBirthdayYear, dob.getUTCMonth(), dob.getUTCDate()),
    );
    if (birthdayThisYear.getTime() <= today.getTime()) {
      nextBirthdayYear += 1;
    }
    const nextBirthday = new Date(Date.UTC(nextBirthdayYear, dob.getUTCMonth(), dob.getUTCDate()));
    const nextBirthdayTotalDays = utcDiffDays(todayIso, nextBirthday.toISOString().slice(0, 10));
    const nextBirthdayMonths = Math.floor(nextBirthdayTotalDays / 30);
    const nextBirthdayDays = nextBirthdayTotalDays % 30;
    setAgeResult({
      years,
      months,
      days,
      nextBirthdayMonths,
      nextBirthdayDays,
      totalDays: utcDiffDays(dobIso, todayIso),
    });
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
      <ScreenHeader title={t('calculator.title')} subtitle={t('calculator.subtitle')} hero={goldHero} />
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[styles.scroll, { paddingBottom: tabBarPadding }]}>
        <SectionLabel>{t('calculator.modeTitle')}</SectionLabel>
        <View style={styles.modelRow}>
          <FilterChip
            label={t('calculator.modePayoff')}
            selected={mode === 'payoff'}
            onPress={() => {
              setMode('payoff');
              setFormError(null);
            }}
          />
          <FilterChip
            label={t('calculator.modeInterest')}
            selected={mode === 'interest'}
            onPress={() => {
              setMode('interest');
              setFormError(null);
            }}
          />
          <FilterChip
            label={t('calculator.modeAge')}
            selected={mode === 'age'}
            onPress={() => {
              setMode('age');
              setFormError(null);
            }}
          />
        </View>

        {mode === 'payoff' ? (
          <>
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
          </>
        ) : null}

        {mode === 'interest' ? (
          <>
            <SectionLabel>{t('calculator.interestCalc.title')}</SectionLabel>
            <Card style={styles.formCard}>
              <View style={styles.modelRow}>
                <FilterChip
                  label={t('calculator.interestCalc.simple')}
                  selected={interestCalcMode === 'simple'}
                  onPress={() => setInterestCalcMode('simple')}
                />
                <FilterChip
                  label={t('calculator.interestCalc.compound')}
                  selected={interestCalcMode === 'compound'}
                  onPress={() => setInterestCalcMode('compound')}
                />
              </View>
              <Field
                label={t('calculator.interestCalc.principalAmount')}
                value={interestAmount}
                onChangeText={setInterestAmount}
                keyboardType="numeric"
              />
              <View style={styles.modelRow}>
                <FilterChip
                  label={t('calculator.interestCalc.rateTypeRupees')}
                  selected={interestRateType === 'rupees'}
                  onPress={() => setInterestRateType('rupees')}
                />
                <FilterChip
                  label={t('calculator.interestCalc.rateTypePercent')}
                  selected={interestRateType === 'percent'}
                  onPress={() => setInterestRateType('percent')}
                />
              </View>
              <Field
                label={
                  interestRateType === 'rupees'
                    ? t('calculator.interestCalc.rateRupees')
                    : t('calculator.interestCalc.ratePercent')
                }
                value={interestRate}
                onChangeText={setInterestRate}
                keyboardType="numeric"
              />
              <View style={styles.modelRow}>
                <FilterChip
                  label={t('calculator.interestCalc.useDates')}
                  selected={interestDurationMode === 'dates'}
                  onPress={() => setInterestDurationMode('dates')}
                />
                <FilterChip
                  label={t('calculator.interestCalc.useDuration')}
                  selected={interestDurationMode === 'duration'}
                  onPress={() => setInterestDurationMode('duration')}
                />
              </View>
              {interestDurationMode === 'dates' ? (
                <>
                  <Field
                    label={t('calculator.interestCalc.fromDate')}
                    value={interestFromDate}
                    onChangeText={setInterestFromDate}
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                  <Field
                    label={t('calculator.interestCalc.toDate')}
                    value={interestToDate}
                    onChangeText={setInterestToDate}
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                </>
              ) : (
                <Field
                  label={t('calculator.interestCalc.durationDays')}
                  value={interestDurationDays}
                  onChangeText={setInterestDurationDays}
                  keyboardType="number-pad"
                />
              )}
              <View style={styles.buttonRow}>
                <Button label={t('common.clear')} variant="secondary" onPress={clearInterest} />
                <Button label={t('calculator.calculate')} onPress={calculateInterest} />
              </View>
            </Card>
          </>
        ) : null}

        {mode === 'age' ? (
          <>
            <SectionLabel>{t('calculator.ageCalc.title')}</SectionLabel>
            <Card style={styles.formCard}>
              <Field
                label={t('calculator.ageCalc.dob')}
                value={ageDob}
                onChangeText={setAgeDob}
                autoCapitalize="none"
                autoCorrect={false}
              />
              <View style={styles.buttonRow}>
                <Button label={t('common.clear')} variant="secondary" onPress={clearAge} />
                <Button label={t('calculator.calculate')} onPress={calculateAge} />
              </View>
            </Card>
          </>
        ) : null}

        <FormNotice error={formError} info={practiceMode ? t('settings.practiceModeOn') : undefined} />

        {mode === 'payoff' && quote ? (
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
        {mode === 'interest' && interestResult ? (
          <>
            <SectionLabel>{t('calculator.interestCalc.resultTitle')}</SectionLabel>
            <SettingsGroup>
              <ListRow
                content={<ThemedText type="bodyLarge">{t('calculator.interestCalc.days')}</ThemedText>}
                trailing={<ThemedText type="bodyLarge">{String(interestResult.days)}</ThemedText>}
              />
              <ListRow
                content={<ThemedText type="bodyLarge">{t('calculator.interestCalc.interest')}</ThemedText>}
                trailing={<MoneyText paise={Math.round(interestResult.interestRupees * 100)} />}
              />
              <ListRow
                isLast
                content={<ThemedText type="bodyBold">{t('calculator.interestCalc.total')}</ThemedText>}
                trailing={<MoneyText paise={Math.round(interestResult.totalRupees * 100)} />}
              />
            </SettingsGroup>
          </>
        ) : null}
        {mode === 'age' && ageResult ? (
          <>
            <SectionLabel>{t('calculator.ageCalc.resultTitle')}</SectionLabel>
            <SettingsGroup>
              <ListRow
                content={<ThemedText type="bodyLarge">{t('calculator.ageCalc.years')}</ThemedText>}
                trailing={<ThemedText type="bodyLarge">{String(ageResult.years)}</ThemedText>}
              />
              <ListRow
                content={<ThemedText type="bodyLarge">{t('calculator.ageCalc.months')}</ThemedText>}
                trailing={<ThemedText type="bodyLarge">{String(ageResult.months)}</ThemedText>}
              />
              <ListRow
                content={<ThemedText type="bodyLarge">{t('calculator.ageCalc.days')}</ThemedText>}
                trailing={<ThemedText type="bodyLarge">{String(ageResult.days)}</ThemedText>}
              />
              <ListRow
                content={<ThemedText type="bodyLarge">{t('calculator.ageCalc.nextBirthday')}</ThemedText>}
                trailing={
                  <ThemedText type="bodyLarge">
                    {t('calculator.ageCalc.nextBirthdayValue', {
                      months: ageResult.nextBirthdayMonths,
                      days: ageResult.nextBirthdayDays,
                    })}
                  </ThemedText>
                }
              />
              <ListRow
                isLast
                content={<ThemedText type="bodyLarge">{t('calculator.ageCalc.totalDays')}</ThemedText>}
                trailing={<ThemedText type="bodyLarge">{String(ageResult.totalDays)}</ThemedText>}
              />
            </SettingsGroup>
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
  buttonRow: {
    marginTop: Spacing.two,
    flexDirection: 'row',
    gap: Spacing.two,
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
