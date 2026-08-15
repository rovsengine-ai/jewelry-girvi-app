import { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { ArchiveConfirm } from '@/components/archive-confirm';
import { Badge } from '@/components/badge';
import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { EmptyState } from '@/components/empty-state';
import { Field } from '@/components/field';
import { FormNotice } from '@/components/form-notice';
import { ListRow } from '@/components/list-row';
import { ListSkeleton } from '@/components/list-row-skeleton';
import { MoneyText } from '@/components/money-text';
import { ScreenHeader } from '@/components/screen-header';
import { SectionLabel } from '@/components/section-label';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Radii, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { unknownMessage } from '@/i18n';
import {
  asBps,
  asPaise,
  formatBpsAsPercent,
  rupeesInputToPaise,
  todayInKolkata,
} from '@/lib/money';
import { kycStatusLabel } from '@/lib/kyc';
import { buildPledgeAgreementHtml, buildRedemptionReceiptHtml } from '@/lib/print-documents';
import { isRenewalEligible, parseOwnerOnlyError } from '@/lib/redemption';
import { supabase } from '@/lib/supabase';
import { mgToGramsInput } from '@/lib/weight';
import { useAuth } from '@/providers/auth-provider';
import { useLanguage } from '@/providers/language-provider';
import {
  archiveLoan,
  fetchLoanBalances,
  fetchLoanCurrentDueOn,
  fetchLoanItems,
  fetchOverdueLoans,
  logPayment,
  resolveReceiptDisplayUrl,
} from '@/services/loanService';
import { shareHtmlAsPdf } from '@/services/printService';
import type { LoanBalances, LoanItem, LoanWithCustomer, Payment } from '@/types/database';

export default function LoanDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { profile } = useAuth();
  const { t, language } = useLanguage();
  const colors = useTheme();
  const isOwner = profile?.role === 'owner';

  const [loan, setLoan] = useState<LoanWithCustomer | null>(null);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [balances, setBalances] = useState<LoanBalances | null>(null);
  const [receiptDisplayUrl, setReceiptDisplayUrl] = useState<string | null>(null);
  const [dueOn, setDueOn] = useState<string | null>(null);
  const [items, setItems] = useState<LoanItem[]>([]);
  const [isOverdue, setIsOverdue] = useState(false);
  const [amountRupees, setAmountRupees] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [formNotice, setFormNotice] = useState<string | null>(null);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [archiveReason, setArchiveReason] = useState('');
  const [archiveSaving, setArchiveSaving] = useState(false);
  const [archiveError, setArchiveError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    if (!id) return;

    const [{ data: loanData, error: loanError }, { data: paymentData, error: paymentError }] =
      await Promise.all([
        supabase
          .from('loans')
          .select(
            `
            *,
            profiles:customer_id (
              full_name,
              phone_number,
              address,
              role,
              id_document_type,
              kyc_verified_on,
              guardian_name
            )
          `,
          )
          .eq('id', id)
          .maybeSingle(),
        supabase.from('payments').select('*').eq('loan_id', id).order('paid_on', { ascending: false }),
      ]);

    if (loanError) {
      throw new Error(loanError.message);
    }
    if (paymentError) {
      throw new Error(paymentError.message);
    }

    setLoan(loanData as LoanWithCustomer | null);
    setPayments((paymentData ?? []) as Payment[]);

    if (loanData) {
      const [nextBalances, signed, nextDueOn, nextItems, overdueRows] = await Promise.all([
        fetchLoanBalances(id, todayInKolkata()),
        resolveReceiptDisplayUrl(loanData.receipt_image_url),
        fetchLoanCurrentDueOn(id),
        fetchLoanItems(id),
        fetchOverdueLoans(),
      ]);
      setBalances(nextBalances);
      setReceiptDisplayUrl(signed);
      setDueOn(nextDueOn);
      setItems(nextItems);
      setIsOverdue(overdueRows.some((row) => row.loan_id === id));
    } else {
      setReceiptDisplayUrl(null);
      setDueOn(null);
      setItems([]);
      setIsOverdue(false);
    }
  }, [id]);

  useEffect(() => {
    void (async () => {
      setIsLoading(true);
      setLoadError(null);
      try {
        await loadData();
      } catch (error) {
        setLoadError(error instanceof Error ? error.message : t('loans.detail.failedBalances'));
      } finally {
        setIsLoading(false);
      }
    })();
  }, [loadData, t]);

  const handleLogPayment = async () => {
    if (!loan || !id) return;
    setFormError(null);
    setFormNotice(null);

    let amountPaise: number;
    try {
      amountPaise = rupeesInputToPaise(amountRupees);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : t('errors.unknown'));
      return;
    }

    setIsSaving(true);
    try {
      await logPayment(id, amountPaise, todayInKolkata());
      await loadData();
      setAmountRupees('');
      setFormNotice(t('loans.detail.paymentLogged'));
    } catch (error) {
      setFormError(error instanceof Error ? error.message : t('errors.unknown'));
    } finally {
      setIsSaving(false);
    }
  };

  const handleArchive = async () => {
    if (!id) return;
    const trimmed = archiveReason.trim();
    if (trimmed === '') return;
    setArchiveError(null);
    setArchiveSaving(true);
    try {
      await archiveLoan({ loanId: id, reason: trimmed });
      setArchiveOpen(false);
      setArchiveReason('');
      setFormNotice(t('archive.notice'));
      await loadData();
    } catch (error) {
      const message = unknownMessage(error, t);
      setArchiveError(parseOwnerOnlyError(message) ? t('archive.ownerOnly') : message);
    } finally {
      setArchiveSaving(false);
    }
  };

  if (isLoading) {
    return (
      <ThemedView style={styles.container}>
        <ScreenHeader title={t('loans.detail.loadErrorTitle')} />
        <ListSkeleton rows={6} />
      </ThemedView>
    );
  }

  if (loadError || !loan || !balances) {
    return (
      <ThemedView style={styles.container}>
        <ScreenHeader title={t('loans.detail.loadErrorTitle')} />
        <View style={styles.body}>
          <Button label={t('common.back')} variant="secondary" onPress={() => router.back()} />
          <EmptyState
            title={loadError ? t('loans.detail.loadErrorTitle') : t('loans.detail.notFoundTitle')}
            body={loadError ?? t('loans.detail.notFoundBody')}
          />
        </View>
      </ThemedView>
    );
  }

  const asOf = todayInKolkata();
  const showRenew =
    isOwner && isRenewalEligible(loan.disbursed_on, loan.simple_period_days, asOf, dueOn);

  const printPledge = async () => {
    setFormError(null);
    try {
      const html = buildPledgeAgreementHtml({
        language,
        serialNumber: loan.serial_number,
        customerName: loan.profiles?.full_name ?? null,
        phoneNumber: loan.profiles?.phone_number ?? null,
        address: loan.profiles?.address ?? null,
        disbursedOn: loan.disbursed_on,
        dueOn,
        principalPaise: asPaise(loan.principal_paise),
        rateBps: asBps(loan.rate_bps),
        interestModel: loan.interest_model,
        simplePeriodDays: loan.simple_period_days,
        items,
      });
      await shareHtmlAsPdf(html, t('loans.detail.sharePledge', { serial: loan.serial_number }));
    } catch (error) {
      setFormError(error instanceof Error ? error.message : t('errors.unknown'));
    }
  };

  const printRedemption = async () => {
    setFormError(null);
    if (loan.status !== 'redeemed' || loan.closure_balance_paise == null || !loan.redeemed_on) {
      setFormError(t('loans.detail.redemptionReceiptUnavailable'));
      return;
    }
    try {
      const html = buildRedemptionReceiptHtml({
        language,
        serialNumber: loan.serial_number,
        customerName: loan.profiles?.full_name ?? null,
        phoneNumber: loan.profiles?.phone_number ?? null,
        redeemedOn: loan.redeemed_on,
        releasedToName: loan.released_to_name,
        releaseNote: loan.release_note,
        closureBalancePaise: asPaise(loan.closure_balance_paise),
        status: loan.status,
        items,
      });
      await shareHtmlAsPdf(html, t('loans.detail.shareRedemption', { serial: loan.serial_number }));
    } catch (error) {
      setFormError(error instanceof Error ? error.message : t('errors.unknown'));
    }
  };

  return (
    <ThemedView style={styles.container} type="surfaceSunken">
      <ScreenHeader title={loan.serial_number} />
      <ScrollView contentContainerStyle={styles.body}>
        <View style={styles.padded}>
          <Button label={t('common.back')} variant="secondary" onPress={() => router.back()} />
          <FormNotice error={formError} notice={formNotice} />
        </View>

        <View style={[styles.hero, { backgroundColor: colors.elevated }]}>
          <View style={styles.heroTop}>
            <ThemedText type="bodyLarge" style={styles.heroName} numberOfLines={1}>
              {loan.profiles?.full_name ?? t('common.unknownCustomer')}
            </ThemedText>
            <Badge status={loan.status} />
          </View>
          <ThemedText type="overline" themeColor="textSecondary">
            {t('loans.detail.totalDue')}
          </ThemedText>
          <MoneyText size="large" paise={balances.totalDuePaise} />
        </View>

        <SectionLabel>{t('loans.detail.sectionCustomer')}</SectionLabel>
        <ThemedText type="label" themeColor="textSecondary" style={styles.padded}>
          {loan.profiles?.phone_number ?? t('common.emDash')}
        </ThemedText>
        <ThemedText type="label" testID="loan-kyc-status" style={styles.padded}>
          {t('loans.detail.kycLine', {
            status: kycStatusLabel(loan.profiles?.kyc_verified_on ?? null, language),
          })}
        </ThemedText>
        <View style={styles.padded}>
          <Button
            testID="open-kyc"
            label={t('loans.detail.captureVerifyKyc')}
            variant="secondary"
            onPress={() => router.push(`/(admin)/kyc/${loan.customer_id}`)}
          />
        </View>

        {receiptDisplayUrl ? (
          <Image source={{ uri: receiptDisplayUrl }} style={styles.receipt} contentFit="cover" />
        ) : null}

        <SectionLabel>{t('loans.detail.summaryTitle')}</SectionLabel>
        <View style={[styles.facts, { backgroundColor: colors.elevated }]}>
          <ThemedText type="label" themeColor="textSecondary">
            {t('loans.detail.summaryMeta', {
              item: loan.item_name,
              weight: loan.weight_grams,
              rate: formatBpsAsPercent(asBps(loan.rate_bps)),
              model: t(`loans.interestModel.${loan.interest_model}`),
            })}
          </ThemedText>
          <ThemedText type="label">{t('loans.detail.disbursed', { date: loan.disbursed_on })}</ThemedText>
          <ThemedText type="label">
            {t('loans.detail.due', { date: dueOn ?? t('common.emDash') })}
          </ThemedText>
          <View style={styles.factRow}>
            <ThemedText type="overline" themeColor="textSecondary">
              {t('loans.detail.originalPrincipal')}
            </ThemedText>
            <MoneyText paise={asPaise(loan.principal_paise)} />
          </View>
          <View style={styles.factRow}>
            <ThemedText type="overline" themeColor="textSecondary">
              {t('loans.detail.interestPaid')}
            </ThemedText>
            <MoneyText paise={balances.interestPaidPaise} />
          </View>
          <View style={styles.factRow}>
            <ThemedText type="overline" themeColor="textSecondary">
              {t('loans.detail.principalPaid')}
            </ThemedText>
            <MoneyText paise={balances.principalPaidPaise} />
          </View>
          <View style={styles.factRow}>
            <ThemedText type="overline" themeColor="textSecondary">
              {t('loans.detail.outstandingPrincipal')}
            </ThemedText>
            <MoneyText paise={balances.outstandingPrincipalPaise} />
          </View>
          <View style={styles.factRow}>
            <ThemedText type="overline" themeColor="textSecondary">
              {t('loans.detail.accruedInterestDue')}
            </ThemedText>
            <MoneyText paise={balances.accruedInterestPaise} />
          </View>
          {loan.status === 'redeemed' && loan.closure_balance_paise != null ? (
            <View style={styles.factRow}>
              <ThemedText type="label">
                {t('loans.detail.redeemedRow', {
                  date: loan.redeemed_on ?? t('common.emDash'),
                  name: loan.released_to_name ?? t('common.emDash'),
                })}
              </ThemedText>
              <MoneyText paise={asPaise(loan.closure_balance_paise)} />
            </View>
          ) : null}
          {loan.status === 'defaulted' && loan.default_balance_paise != null ? (
            <View style={styles.factRow}>
              <ThemedText type="label">
                {loan.default_reason
                  ? t('loans.detail.defaultedRowReason', {
                      date: loan.defaulted_on ?? t('common.emDash'),
                      reason: loan.default_reason,
                    })
                  : t('loans.detail.defaultedRow', {
                      date: loan.defaulted_on ?? t('common.emDash'),
                    })}
              </ThemedText>
              <MoneyText paise={asPaise(loan.default_balance_paise)} />
            </View>
          ) : null}
        </View>

        <SectionLabel>{t('loans.detail.pledgedItems')}</SectionLabel>
        {items.length === 0 ? (
          <EmptyState
            title={t('loans.detail.itemsEmptyTitle')}
            body={t('loans.detail.itemsEmptyBody')}
          />
        ) : (
          items.map((item, index) => (
            <ListRow
              key={item.id}
              tone="elevated"
              isLast={index === items.length - 1}
              content={
                <ThemedText type="label">
                  {t('loans.detail.itemMeta', {
                    metal: item.metal ? t(`items.${item.metal}`) : t('loans.detail.metalUnknown'),
                    ornament: item.ornament_type,
                    grams: mgToGramsInput(item.net_weight_mg),
                    purity:
                      item.purity_karat != null
                        ? t('loans.detail.purityKarat', { karat: item.purity_karat })
                        : t('loans.detail.purityNotAssessed'),
                    qty: item.quantity > 1 ? t('loans.detail.quantitySuffix', { qty: item.quantity }) : '',
                    assessed: item.valuation_paise != null ? t('loans.detail.assessedNotIbja') : '',
                  })}
                </ThemedText>
              }
              trailing={
                item.valuation_paise != null ? (
                  <MoneyText paise={asPaise(item.valuation_paise)} />
                ) : undefined
              }
            />
          ))
        )}

        <SectionLabel>{t('loans.detail.sectionActions')}</SectionLabel>
        <View style={styles.actions}>
          {loan.status === 'active' ? (
            <Button
              testID="open-redeem"
              label={t('loans.detail.redeem')}
              onPress={() => router.push(`/(admin)/loan/${id}/redeem`)}
            />
          ) : null}
          {showRenew ? (
            <Button
              testID="open-renew"
              label={t('loans.detail.renew')}
              variant="secondary"
              onPress={() => router.push(`/(admin)/loan/${id}/renew`)}
            />
          ) : null}
          {isOwner && loan.status === 'active' && isOverdue ? (
            <Button
              testID="open-default"
              label={t('loans.detail.defaultLoan')}
              variant="danger"
              onPress={() => router.push(`/(admin)/loan/${id}/default`)}
            />
          ) : null}
          {isOwner ? (
            <Button
              testID="open-edit-terms"
              label={t('loans.detail.editTerms')}
              variant="secondary"
              onPress={() => router.push(`/(admin)/loan/${id}/terms`)}
            />
          ) : null}
          {isOwner && loan.archived_at == null ? (
            <Button
              testID="open-archive"
              label={t('archive.archive')}
              variant="danger"
              onPress={() => {
                setArchiveError(null);
                setArchiveReason('');
                setArchiveOpen(true);
              }}
            />
          ) : null}
          {isOwner && loan.archived_at != null ? (
            <ThemedText type="small">{t('archive.alreadyArchived')}</ThemedText>
          ) : null}
          <Button
            testID="print-pledge"
            label={t('loans.detail.printPledge')}
            variant="secondary"
            onPress={() => void printPledge()}
          />
          {loan.status === 'redeemed' ? (
            <Button
              testID="print-redemption"
              label={t('loans.detail.printReceipt')}
              variant="secondary"
              onPress={() => void printRedemption()}
            />
          ) : null}
        </View>

        {loan.status === 'active' ? (
          <Card style={styles.paymentCard}>
            <ThemedText type="smallBold">{t('loans.detail.recordPaymentTitle')}</ThemedText>
            <ThemedText type="small">{t('loans.detail.recordPaymentHint')}</ThemedText>
            <Field
              label={t('loans.detail.amountInRupees')}
              value={amountRupees}
              onChangeText={setAmountRupees}
              keyboardType="numeric"
              testID="payment-amount"
            />
            <Button
              testID="record-payment"
              label={t('loans.detail.recordPayment')}
              loading={isSaving}
              onPress={() => void handleLogPayment()}
            />
          </Card>
        ) : null}

        <SectionLabel>{t('loans.detail.paymentHistory')}</SectionLabel>
        {payments.length === 0 ? (
          <EmptyState
            title={t('loans.detail.paymentsEmptyTitle')}
            body={t('loans.detail.paymentsEmptyBody')}
          />
        ) : (
          payments.map((item, index) => (
            <ListRow
              key={item.id}
              tone="elevated"
              isLast={index === payments.length - 1}
              content={
                <ThemedText type="label">
                  {t('loans.detail.paidOn', { date: item.paid_on })}
                </ThemedText>
              }
              trailing={<MoneyText paise={asPaise(item.amount_paid_paise)} />}
            />
          ))
        )}
      </ScrollView>
      {archiveOpen ? (
        <ArchiveConfirm
          serial={loan.serial_number}
          reason={archiveReason}
          onChangeReason={setArchiveReason}
          onCancel={() => {
            setArchiveOpen(false);
            setArchiveReason('');
            setArchiveError(null);
          }}
          onConfirm={() => void handleArchive()}
          loading={archiveSaving}
          error={archiveError}
        />
      ) : null}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  body: { paddingBottom: Spacing.six, gap: Spacing.two },
  padded: { paddingHorizontal: Spacing.four },
  hero: {
    marginHorizontal: Spacing.four,
    marginTop: Spacing.two,
    borderRadius: Radii.md,
    padding: Spacing.four,
    gap: Spacing.two,
  },
  heroTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  heroName: { flex: 1 },
  receipt: {
    width: 'auto',
    marginHorizontal: Spacing.four,
    height: 180,
    borderRadius: Radii.md,
    marginVertical: Spacing.two,
  },
  facts: {
    marginHorizontal: Spacing.four,
    borderRadius: Radii.md,
    padding: Spacing.three,
    gap: Spacing.three,
  },
  factRow: {
    gap: Spacing.half,
  },
  actions: {
    paddingHorizontal: Spacing.four,
    gap: Spacing.two,
    paddingBottom: Spacing.three,
  },
  paymentCard: {
    marginHorizontal: Spacing.four,
  },
});
