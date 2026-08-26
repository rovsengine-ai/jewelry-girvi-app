/**
 * Shopfront loan detail. RPCs and owner gates unchanged.
 * Call: https://docs.expo.dev/versions/v57.0.0/sdk/linking/
 * Photos: https://docs.expo.dev/versions/v57.0.0/sdk/image/
 * Accordion: https://docs.expo.dev/versions/v57.0.0/sdk/reanimated/
 */
import { Image } from 'expo-image';
import * as Linking from 'expo-linking';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { Accordion, useChevronRotation } from '@/components/accordion';
import { ArchiveConfirm } from '@/components/archive-confirm';
import { AppIcon } from '@/components/app-icon';
import { CustomerAvatar } from '@/components/customer-avatar';
import { Badge } from '@/components/badge';
import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { EmptyState } from '@/components/empty-state';
import { Field } from '@/components/field';
import { FormNotice } from '@/components/form-notice';
import { ListRow } from '@/components/list-row';
import { ListSkeleton } from '@/components/list-row-skeleton';
import { MoneyText } from '@/components/money-text';
import { PressableScale } from '@/components/pressable-scale';
import { ScreenHeader } from '@/components/screen-header';
import { SectionLabel } from '@/components/section-label';
import { SettingsGroup } from '@/components/settings-group';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { TokenQr } from '@/components/token-qr';
import { MinTouchTarget, Radii, Sizes, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { unknownMessage } from '@/i18n';
import { newIdempotencyKey } from '@/lib/idempotency';
import { kycStatusLabel } from '@/lib/kyc';
import {
  asBps,
  asPaise,
  formatBpsAsPercent,
  rupeesInputToPaise,
  todayInKolkata,
} from '@/lib/money';
import { buildPledgeAgreementHtml, buildRedemptionReceiptHtml } from '@/lib/print-documents';
import { qrCodeSvgDataUri } from '@/lib/qr-data-uri';
import { isRenewalEligible, parseOwnerOnlyError } from '@/lib/redemption';
import { telHref } from '@/lib/phone';
import { supabase } from '@/lib/supabase';
import { activationLandingUrl, loanLandingUrl } from '@/lib/web-origin';
import { mgToGramsInput } from '@/lib/weight';
import { useAuth } from '@/providers/auth-provider';
import { useLanguage } from '@/providers/language-provider';
import {
  archiveLoan,
  fetchLoanBalances,
  fetchLoanCurrentDueOn,
  fetchLoanItemPhotos,
  fetchLoanItems,
  fetchOverdueLoans,
  logPayment,
  resolveReceiptDisplayUrl,
  unredeemLoan,
} from '@/services/loanService';
import {
  issueLoginToken,
  LOGIN_TOKEN_TTL_MS,
  resetCustomerPin,
} from '@/services/customerAuthService';
import { shareHtmlAsPdf } from '@/services/printService';
import { resolveCustomerPhotoUrl } from '@/services/kycService';
import type { LoanBalances, LoanItem, LoanWithCustomer, Payment } from '@/types/database';

export default function LoanDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { profile } = useAuth();
  const { t, language } = useLanguage();
  const colors = useTheme();
  const isOwner = profile?.role === 'owner';
  const isShopUser = profile?.role === 'owner' || profile?.role === 'staff';

  const [loan, setLoan] = useState<LoanWithCustomer | null>(null);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [balances, setBalances] = useState<LoanBalances | null>(null);
  const [receiptDisplayUrl, setReceiptDisplayUrl] = useState<string | null>(null);
  const [customerPhotoUrl, setCustomerPhotoUrl] = useState<string | null>(null);
  const [dueOn, setDueOn] = useState<string | null>(null);
  const [items, setItems] = useState<LoanItem[]>([]);
  const [itemPhotoUrls, setItemPhotoUrls] = useState<Record<string, string>>({});
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
  const [unredeemOpen, setUnredeemOpen] = useState(false);
  const [unredeemReason, setUnredeemReason] = useState('');
  const [unredeemSaving, setUnredeemSaving] = useState(false);
  const [unredeemError, setUnredeemError] = useState<string | null>(null);
  const [pledgeSignatureUrl, setPledgeSignatureUrl] = useState<string | null>(null);
  const [releaseSignatureUrl, setReleaseSignatureUrl] = useState<string | null>(null);
  const [customerOpen, setCustomerOpen] = useState(false);
  const [itemsOpen, setItemsOpen] = useState(false);
  const [customerQrOpen, setCustomerQrOpen] = useState(false);
  const [customerQrUrl, setCustomerQrUrl] = useState<string | null>(null);
  const [customerQrExpiresAt, setCustomerQrExpiresAt] = useState<number | null>(null);
  const [customerQrRemainingMs, setCustomerQrRemainingMs] = useState(0);
  const [customerQrLoading, setCustomerQrLoading] = useState(false);
  const [customerQrError, setCustomerQrError] = useState<string | null>(null);
  const [resetPinOpen, setResetPinOpen] = useState(false);
  const [resetPinSaving, setResetPinSaving] = useState(false);
  const [resetPinError, setResetPinError] = useState<string | null>(null);
  const paymentIdempotencyKeyRef = useRef(newIdempotencyKey());
  const customerChevron = useChevronRotation(customerOpen);
  const itemsChevron = useChevronRotation(itemsOpen);

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
              guardian_name,
              photo_path
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
      const [nextBalances, signed, photoSigned, pledgeSigned, releaseSigned, nextDueOn, nextItems, overdueRows] =
        await Promise.all([
        fetchLoanBalances(id, todayInKolkata()),
        resolveReceiptDisplayUrl(loanData.receipt_image_url),
        resolveCustomerPhotoUrl(
          (loanData as LoanWithCustomer).profiles?.photo_path ?? null,
        ),
        resolveReceiptDisplayUrl(loanData.digital_signature_url),
        resolveReceiptDisplayUrl(loanData.release_signature_url),
        fetchLoanCurrentDueOn(id),
        fetchLoanItems(id),
        fetchOverdueLoans(),
      ]);
      setBalances(nextBalances);
      setReceiptDisplayUrl(signed);
      setCustomerPhotoUrl(photoSigned);
      setPledgeSignatureUrl(pledgeSigned);
      setReleaseSignatureUrl(releaseSigned);
      setDueOn(nextDueOn);
      setItems(nextItems);
      setIsOverdue(overdueRows.some((row) => row.loan_id === id));
      const itemPhotos = await fetchLoanItemPhotos(nextItems.map((item) => item.id));
      const signedByItem: Record<string, string> = {};
      await Promise.all(
        itemPhotos.map(async (photo) => {
          const url = await resolveReceiptDisplayUrl(photo.storage_path);
          if (url && signedByItem[photo.loan_item_id] == null) {
            signedByItem[photo.loan_item_id] = url;
          }
        }),
      );
      setItemPhotoUrls(signedByItem);
    } else {
      setReceiptDisplayUrl(null);
      setCustomerPhotoUrl(null);
      setPledgeSignatureUrl(null);
      setReleaseSignatureUrl(null);
      setDueOn(null);
      setItems([]);
      setItemPhotoUrls({});
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
      await logPayment(id, amountPaise, todayInKolkata(), {
        idempotencyKey: paymentIdempotencyKeyRef.current,
      });
      paymentIdempotencyKeyRef.current = newIdempotencyKey();
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

  const handleUnredeem = async () => {
    if (!id) return;
    const trimmed = unredeemReason.trim();
    if (trimmed === '') return;
    setUnredeemError(null);
    setUnredeemSaving(true);
    try {
      await unredeemLoan({ loanId: id, reason: trimmed });
      setUnredeemOpen(false);
      setUnredeemReason('');
      setFormNotice(t('unredeem.notice'));
      await loadData();
    } catch (error) {
      const message = unknownMessage(error, t);
      setUnredeemError(parseOwnerOnlyError(message) ? t('unredeem.ownerOnly') : message);
    } finally {
      setUnredeemSaving(false);
    }
  };

  const closeCustomerQr = () => {
    setCustomerQrOpen(false);
    setCustomerQrUrl(null);
    setCustomerQrExpiresAt(null);
    setCustomerQrRemainingMs(0);
    setCustomerQrError(null);
  };

  const handleResetCustomerPin = async () => {
    if (!loan) return;
    setResetPinError(null);
    setResetPinSaving(true);
    const { error } = await resetCustomerPin(loan.customer_id);
    setResetPinSaving(false);

    if (error) {
      setResetPinError(
        error.includes('shop_only') ? t('loans.detail.resetCustomerPinFailed') : error,
      );
      return;
    }

    setResetPinOpen(false);
    setFormNotice(t('loans.detail.resetCustomerPinDone'));
  };

  const handleShowCustomerQr = async () => {
    if (!loan) return;
    setCustomerQrError(null);
    setCustomerQrLoading(true);
    setCustomerQrOpen(true);
    setCustomerQrUrl(null);
    setCustomerQrExpiresAt(null);

    const { token, error } = await issueLoginToken(loan.customer_id, loan.id);
    setCustomerQrLoading(false);

    if (error || !token) {
      setCustomerQrError(t('loans.detail.customerQrFailed'));
      return;
    }

    try {
      const url = activationLandingUrl(token);
      const expiresAt = Date.now() + LOGIN_TOKEN_TTL_MS;
      setCustomerQrUrl(url);
      setCustomerQrExpiresAt(expiresAt);
      setCustomerQrRemainingMs(LOGIN_TOKEN_TTL_MS);
    } catch {
      setCustomerQrError(t('loans.detail.loanQrMissingOrigin'));
    }
  };

  useEffect(() => {
    if (!customerQrOpen || customerQrExpiresAt == null) {
      return;
    }

    const tick = () => {
      const remaining = Math.max(0, customerQrExpiresAt - Date.now());
      setCustomerQrRemainingMs(remaining);
    };

    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [customerQrOpen, customerQrExpiresAt]);

  if (isLoading) {
    return (
      <ThemedView style={styles.container}>
        <ScreenHeader showBack title={t('loans.detail.loadErrorTitle')} />
        <ListSkeleton rows={6} />
      </ThemedView>
    );
  }

  if (loadError || !loan || !balances) {
    return (
      <ThemedView style={styles.container}>
        <ScreenHeader showBack title={t('loans.detail.loadErrorTitle')} />
        <View style={styles.body}>
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

  let loanQrValue: string | null = null;
  try {
    loanQrValue = loanLandingUrl(loan.public_token);
  } catch {
    loanQrValue = null;
  }

  const printPledge = async () => {
    setFormError(null);
    try {
      const loanQrDataUri = await qrCodeSvgDataUri(
        loanLandingUrl(loan.public_token),
        Sizes.qrCodePrint,
      );
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
        loanQrDataUri,
        items,
      });
      await shareHtmlAsPdf(html, t('loans.detail.sharePledge', { serial: loan.serial_number }));
    } catch (error) {
      const message = error instanceof Error ? error.message : t('errors.unknown');
      setFormError(
        message.includes('EXPO_PUBLIC_WEB_ORIGIN') ? t('loans.detail.loanQrMissingOrigin') : message,
      );
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

  const phoneHref = telHref(loan.profiles?.phone_number);

  return (
    <ThemedView style={styles.container} type="surfaceSunken">
      <ScreenHeader
        showBack
        title={loan.serial_number}
        trailing={
          <PressableScale
            accessibilityRole="button"
            accessibilityLabel={t('a11y.print')}
            onPress={() => void printPledge()}
            style={styles.iconHit}>
            <AppIcon ios="printer" android="print" color={colors.onChrome} />
          </PressableScale>
        }
      />
      <ScrollView contentContainerStyle={styles.body}>
        <View style={styles.padded}>
          <FormNotice error={formError} notice={formNotice} />
          {loan.status === 'redeemed' && loan.archived_at == null ? (
            <FormNotice
              notice={
                isOwner
                  ? t('loans.detail.redeemedAwaitingArchive')
                  : t('loans.detail.redeemedLive')
              }
            />
          ) : null}
        </View>

        <Card style={styles.block}>
          <View style={styles.customerHead}>
            <PressableScale
              accessibilityRole="button"
              accessibilityState={{ expanded: customerOpen }}
              accessibilityLabel={
                customerOpen ? t('a11y.collapse') : t('a11y.expand')
              }
              onPress={() => setCustomerOpen(!customerOpen)}
              style={styles.customerPress}>
              <CustomerAvatar
                name={loan.profiles?.full_name}
                photoUrl={customerPhotoUrl}
              />
              <View style={styles.customerCopy}>
                <ThemedText type="bodyLarge">
                  {loan.profiles?.full_name ?? t('common.unknownCustomer')}
                </ThemedText>
                <ThemedText type="label" style={{ color: colors.accentWarning }}>
                  {loan.profiles?.phone_number ?? t('common.emDash')}
                </ThemedText>
              </View>
              <Animated.View style={customerChevron}>
                <AppIcon
                  ios="chevron.down"
                  android="expand_more"
                  color={colors.textSecondary}
                  accessibilityLabel={t('a11y.chevron')}
                />
              </Animated.View>
            </PressableScale>
            {phoneHref ? (
              <PressableScale
                accessibilityRole="button"
                accessibilityLabel={t('a11y.call')}
                onPress={() => {
                  void Linking.openURL(phoneHref);
                }}
                style={styles.iconHit}>
                <AppIcon ios="phone.fill" android="call" color={colors.accentWarning} />
              </PressableScale>
            ) : null}
          </View>
          <Accordion expanded={customerOpen}>
            <View style={styles.threeUp}>
              <View style={styles.stat}>
                <ThemedText type="overline" themeColor="textSecondary">
                  {t('loans.detail.totalDue')}
                </ThemedText>
                <MoneyText paise={balances.totalDuePaise} />
              </View>
              <View style={styles.stat}>
                <ThemedText type="overline" themeColor="textSecondary">
                  {t('loans.detail.outstandingPrincipal')}
                </ThemedText>
                <MoneyText paise={balances.outstandingPrincipalPaise} />
              </View>
              <View style={styles.stat}>
                <ThemedText type="overline" themeColor="textSecondary">
                  {t('loans.detail.accruedInterestDue')}
                </ThemedText>
                <MoneyText paise={balances.accruedInterestPaise} />
              </View>
            </View>
          </Accordion>
        </Card>

        <View style={styles.padded}>
          <ListRow
            tone="elevated"
            isLast
            testID="loan-kyc-status"
            content={
              <ThemedText type="label">
                {t('loans.detail.kycLine', {
                  status: kycStatusLabel(loan.profiles?.kyc_verified_on ?? null, language),
                })}
              </ThemedText>
            }
          />
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

        <Card style={styles.block}>
          <ThemedText type="smallBold">{t('loans.detail.pledgeSignature')}</ThemedText>
          {pledgeSignatureUrl ? (
            <Image
              source={{ uri: pledgeSignatureUrl }}
              style={styles.signature}
              contentFit="contain"
              accessibilityLabel={t('loans.detail.pledgeSignature')}
            />
          ) : (
            <ThemedText type="small" themeColor="textSecondary">
              {t('loans.detail.noSignature')}
            </ThemedText>
          )}
          {loan.status === 'redeemed' ? (
            <>
              <ThemedText type="smallBold">{t('loans.detail.releaseSignature')}</ThemedText>
              {releaseSignatureUrl ? (
                <Image
                  source={{ uri: releaseSignatureUrl }}
                  style={styles.signature}
                  contentFit="contain"
                  accessibilityLabel={t('loans.detail.releaseSignature')}
                />
              ) : (
                <ThemedText type="small" themeColor="textSecondary">
                  {t('loans.detail.noSignature')}
                </ThemedText>
              )}
            </>
          ) : null}
        </Card>

        <Card style={styles.block}>
          <View style={styles.termsHead}>
            <View style={[styles.serialBadge, { backgroundColor: colors.tintWarning }]}>
              <ThemedText type="caption" style={{ color: colors.accentWarning }}>
                {loan.serial_number}
              </ThemedText>
            </View>
            <Badge status={loan.status} />
          </View>
          <View style={styles.dateRow}>
            <AppIcon ios="calendar" android="calendar_month" color={colors.textSecondary} />
            <View style={styles.dateCopy}>
              <ThemedText type="label" themeColor="textSecondary">
                {t('loans.detail.dateRange', {
                  from: loan.disbursed_on,
                  to: dueOn ?? t('common.emDash'),
                })}
              </ThemedText>
              <ThemedText type="caption" themeColor="textSecondary">
                {t('loans.detail.asOfDate', { date: asOf })}
              </ThemedText>
            </View>
          </View>
          <View style={styles.fourUp}>
            <View style={styles.stat}>
              <ThemedText type="overline" themeColor="textSecondary">
                {t('loans.detail.originalPrincipal')}
              </ThemedText>
              <MoneyText paise={asPaise(loan.principal_paise)} />
            </View>
            <View style={styles.stat}>
              <ThemedText type="overline" themeColor="textSecondary">
                {t('loans.terms.interestModel')}
              </ThemedText>
              <ThemedText type="bodyBold">
                {t(`loans.interestModel.${loan.interest_model}`)}
              </ThemedText>
            </View>
            <View style={styles.stat}>
              <ThemedText type="overline" themeColor="textSecondary">
                {t('loans.terms.rateLabel')}
              </ThemedText>
              <ThemedText type="bodyBold">
                {formatBpsAsPercent(asBps(loan.rate_bps))}
                {t('common.ratePer30d')}
              </ThemedText>
            </View>
            <View style={styles.stat}>
              <ThemedText type="overline" themeColor="textSecondary">
                {t('loans.terms.simplePeriod')}
              </ThemedText>
              <ThemedText type="bodyBold">
                {t('loans.detail.tenureDays', { days: loan.simple_period_days })}
              </ThemedText>
              <ThemedText type="caption" themeColor="textSecondary">
                {t('loans.detail.simplePeriodDeadline', {
                  days: loan.simple_period_days,
                  months: Math.round(loan.simple_period_days / 30),
                })}
              </ThemedText>
            </View>
          </View>
        </Card>

        <Card style={styles.block}>
          <View style={styles.threeUp}>
            <View style={styles.stat}>
              <ThemedText type="overline" themeColor="textSecondary">
                {t('loans.detail.totalDue')}
              </ThemedText>
              <MoneyText paise={balances.totalDuePaise} />
            </View>
            <View style={styles.stat}>
              <ThemedText type="overline" themeColor="textSecondary">
                {t('loans.detail.interestPaid')}
              </ThemedText>
              <MoneyText paise={balances.interestPaidPaise} style={{ color: colors.success }} />
            </View>
            <View style={styles.stat}>
              <ThemedText type="overline" themeColor="textSecondary">
                {t('loans.detail.outstandingPrincipal')}
              </ThemedText>
              <MoneyText
                paise={balances.outstandingPrincipalPaise}
                style={{ color: colors.danger }}
              />
            </View>
          </View>
          <ListRow
            tone="elevated"
            content={
              <ThemedText type="overline" themeColor="textSecondary">
                {t('loans.detail.principalPaid')}
              </ThemedText>
            }
            trailing={
              <MoneyText paise={balances.principalPaidPaise} style={{ color: colors.success }} />
            }
          />
          <ListRow
            tone="elevated"
            isLast={
              !(
                (loan.status === 'redeemed' && loan.closure_balance_paise != null) ||
                (loan.status === 'defaulted' && loan.default_balance_paise != null)
              )
            }
            content={
              <ThemedText type="overline" themeColor="textSecondary">
                {t('loans.detail.accruedInterestDue')}
              </ThemedText>
            }
            trailing={
              <MoneyText paise={balances.accruedInterestPaise} style={{ color: colors.danger }} />
            }
          />
          {loan.status === 'redeemed' && loan.closure_balance_paise != null ? (
            <ListRow
              tone="elevated"
              isLast
              content={
                <ThemedText type="label">
                  {t('loans.detail.redeemedRow', {
                    date: loan.redeemed_on ?? t('common.emDash'),
                    name: loan.released_to_name ?? t('common.emDash'),
                  })}
                </ThemedText>
              }
              trailing={<MoneyText paise={asPaise(loan.closure_balance_paise)} />}
            />
          ) : null}
          {loan.status === 'defaulted' && loan.default_balance_paise != null ? (
            <ListRow
              tone="elevated"
              isLast
              content={
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
              }
              trailing={<MoneyText paise={asPaise(loan.default_balance_paise)} />}
            />
          ) : null}
        </Card>

        {items.length === 0 ? (
          <EmptyState
            title={t('loans.detail.itemsEmptyTitle')}
            body={t('loans.detail.itemsEmptyBody')}
          />
        ) : (
          <Card style={styles.block}>
            <PressableScale
              accessibilityRole="button"
              accessibilityState={{ expanded: itemsOpen }}
              accessibilityLabel={itemsOpen ? t('a11y.collapse') : t('a11y.expand')}
              onPress={() => setItemsOpen(!itemsOpen)}
              style={styles.customerHead}>
              <ThemedText type="bodyLarge" style={styles.heroName}>
                {t('loans.detail.totalItems', { count: items.length })}
              </ThemedText>
              <Animated.View style={itemsChevron}>
                <AppIcon
                  ios="chevron.down"
                  android="expand_more"
                  color={colors.textSecondary}
                  accessibilityLabel={t('a11y.chevron')}
                />
              </Animated.View>
            </PressableScale>
            <Accordion expanded={itemsOpen}>
              {items.map((item, index) => (
                <ListRow
                  key={item.id}
                  tone="elevated"
                  isLast={index === items.length - 1}
                  leading={
                    itemPhotoUrls[item.id] ? (
                      <Image
                        source={{ uri: itemPhotoUrls[item.id] }}
                        style={styles.itemThumb}
                        contentFit="cover"
                        accessibilityLabel={t('items.photo')}
                      />
                    ) : (
                      <AppIcon
                        ios={item.metal === 'silver' ? 'circle' : 'circle.fill'}
                        android={item.metal === 'silver' ? 'radio_button_unchecked' : 'circle'}
                        color={item.metal === 'silver' ? colors.textSecondary : colors.gold}
                      />
                    )
                  }
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
                      })}
                    </ThemedText>
                  }
                />
              ))}
            </Accordion>
          </Card>
        )}

        <SectionLabel>{t('loans.detail.loanQrTitle')}</SectionLabel>
        <Card style={styles.block} testID="loan-receipt-qr">
          {loanQrValue ? (
            <View style={styles.loanQrWrap}>
              <TokenQr value={loanQrValue} size={Sizes.qrCode} testID="loan-receipt-qr-code" />
              <ThemedText type="small" themeColor="textSecondary">
                {t('loans.detail.loanQrHint')}
              </ThemedText>
            </View>
          ) : (
            <ThemedText type="small" themeColor="textSecondary">
              {t('loans.detail.loanQrMissingOrigin')}
            </ThemedText>
          )}
        </Card>

        <SectionLabel>{t('loans.detail.sectionActions')}</SectionLabel>
        <View style={styles.actions}>
          {isShopUser ? (
            <Button
              testID="show-customer-qr"
              label={t('loans.detail.showCustomerQr')}
              variant="secondary"
              onPress={() => void handleShowCustomerQr()}
            />
          ) : null}
          {isShopUser ? (
            <Button
              testID="reset-customer-pin"
              label={t('loans.detail.resetCustomerPin')}
              variant="secondary"
              onPress={() => {
                setResetPinError(null);
                setResetPinOpen(true);
              }}
            />
          ) : null}
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
          {isOwner && loan.status === 'redeemed' && loan.archived_at == null ? (
            <Button
              testID="open-unredeem"
              label={t('unredeem.revert')}
              variant="secondary"
              onPress={() => {
                setUnredeemError(null);
                setUnredeemReason('');
                setUnredeemOpen(true);
              }}
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
              label={
                loan.status === 'redeemed'
                  ? t('archive.archiveAfterPickup')
                  : t('archive.archive')
              }
              variant={loan.status === 'redeemed' ? 'primary' : 'danger'}
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
              label={t('loans.detail.addTransaction')}
              loading={isSaving}
              requiresNetwork
              onPress={() => void handleLogPayment()}
              style={styles.addTxn}
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
          <SettingsGroup>
            {payments.map((item, index) => {
              const showDate = index === 0 || item.paid_on !== payments[index - 1]?.paid_on;
              return (
                <View key={item.id}>
                  {showDate ? (
                    <ThemedText type="label" themeColor="textSecondary" style={styles.dateGroup}>
                      {item.paid_on}
                    </ThemedText>
                  ) : null}
                  <ListRow
                    tone="elevated"
                    isLast={index === payments.length - 1}
                    content={
                      <ThemedText type="caption" themeColor="textSecondary">
                        {t('loans.detail.paidOn', { date: item.paid_on })}
                      </ThemedText>
                    }
                    trailing={<MoneyText paise={asPaise(item.amount_paid_paise)} />}
                  />
                </View>
              );
            })}
          </SettingsGroup>
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
      {unredeemOpen ? (
        <ArchiveConfirm
          serial={loan.serial_number}
          reason={unredeemReason}
          onChangeReason={setUnredeemReason}
          onCancel={() => {
            setUnredeemOpen(false);
            setUnredeemReason('');
            setUnredeemError(null);
          }}
          onConfirm={() => void handleUnredeem()}
          loading={unredeemSaving}
          error={unredeemError}
          title={t('unredeem.confirmTitle', { serial: loan.serial_number })}
          body={t('unredeem.confirmBody')}
          confirmLabel={t('unredeem.confirm')}
          confirmVariant="danger"
          reasonLabel={t('unredeem.reasonLabel')}
          reasonPlaceholder={t('unredeem.reasonPlaceholder')}
          testID="unredeem-confirm"
          confirmTestID="unredeem-confirm-button"
          reasonTestID="unredeem-reason"
        />
      ) : null}
      {customerQrOpen ? (
        <View
          testID="customer-qr-overlay"
          style={[styles.customerQrOverlay, { backgroundColor: colors.overlay }]}>
          <Card style={styles.customerQrCard}>
            <ThemedText type="smallBold">{t('loans.detail.customerQrTitle')}</ThemedText>
            <ThemedText type="small">{t('loans.detail.customerQrHint')}</ThemedText>
            <FormNotice error={customerQrError} />
            {customerQrLoading ? (
              <ThemedText type="small">{t('common.generating')}</ThemedText>
            ) : null}
            {customerQrUrl ? (
              <>
                <View style={styles.activationQrWrap}>
                  <TokenQr
                    value={customerQrUrl}
                    size={Sizes.qrCodeLarge}
                    testID="customer-activation-qr"
                  />
                </View>
                <ThemedText type="label">{t('loans.detail.customerQrLinkLabel')}</ThemedText>
                <ThemedText type="small" selectable>
                  {customerQrUrl}
                </ThemedText>
                <ThemedText type="smallBold">
                  {customerQrRemainingMs > 0
                    ? t('loans.detail.customerQrCountdown', {
                        time: formatCountdown(customerQrRemainingMs),
                      })
                    : t('loans.detail.customerQrExpired')}
                </ThemedText>
              </>
            ) : null}
            <Button
              testID="customer-qr-close"
              label={t('loans.detail.customerQrClose')}
              variant="secondary"
              onPress={closeCustomerQr}
            />
          </Card>
        </View>
      ) : null}
      {resetPinOpen ? (
        <View
          testID="reset-pin-overlay"
          style={[styles.customerQrOverlay, { backgroundColor: colors.overlay }]}>
          <Card style={styles.customerQrCard}>
            <ThemedText type="smallBold">{t('loans.detail.resetCustomerPinConfirmTitle')}</ThemedText>
            <ThemedText type="small">{t('loans.detail.resetCustomerPinConfirmBody')}</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {t('loans.detail.resetCustomerPinHint')}
            </ThemedText>
            <FormNotice error={resetPinError} />
            <Button
              label={t('common.cancel')}
              variant="secondary"
              disabled={resetPinSaving}
              onPress={() => {
                setResetPinOpen(false);
                setResetPinError(null);
              }}
            />
            <Button
              testID="reset-customer-pin-confirm"
              label={t('loans.detail.resetCustomerPin')}
              loading={resetPinSaving}
              requiresNetwork
              onPress={() => void handleResetCustomerPin()}
            />
          </Card>
        </View>
      ) : null}
    </ThemedView>
  );
}

function formatCountdown(ms: number): string {
  const totalSeconds = Math.ceil(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  body: { paddingBottom: Spacing.six, gap: Spacing.two },
  padded: { paddingHorizontal: Spacing.four, gap: Spacing.two },
  block: {
    marginHorizontal: Spacing.four,
  },
  customerQrOverlay: {
    ...StyleSheet.absoluteFill,
    justifyContent: 'center',
    padding: Spacing.four,
  },
  customerQrCard: {
    gap: Spacing.three,
  },
  activationQrWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.two,
  },
  loanQrWrap: {
    alignItems: 'center',
    gap: Spacing.two,
  },
  customerHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  customerPress: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    minHeight: MinTouchTarget,
  },
  customerCopy: {
    flex: 1,
    minWidth: 0,
    gap: Spacing.half,
  },
  iconHit: {
    minWidth: MinTouchTarget,
    minHeight: MinTouchTarget,
    alignItems: 'center',
    justifyContent: 'center',
  },
  threeUp: {
    flexDirection: 'row',
    gap: Spacing.two,
    paddingTop: Spacing.two,
  },
  fourUp: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  stat: {
    flex: 1,
    minWidth: 0,
    gap: Spacing.half,
  },
  termsHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  serialBadge: {
    borderRadius: Radii.pill,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.one,
  },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    minHeight: MinTouchTarget,
  },
  dateCopy: {
    flex: 1,
    minWidth: 0,
    gap: Spacing.half,
  },
  heroName: { flex: 1, minWidth: 0 },
  receipt: {
    width: 'auto',
    marginHorizontal: Spacing.four,
    height: Sizes.receiptThumbHeight,
    borderRadius: Radii.md,
    marginVertical: Spacing.two,
  },
  signature: {
    width: '100%',
    height: Sizes.signatureThumbHeight,
    borderRadius: Radii.sm,
    backgroundColor: '#FFFFFF',
  },
  itemThumb: {
    width: MinTouchTarget,
    height: MinTouchTarget,
    borderRadius: Radii.sm,
  },
  actions: {
    paddingHorizontal: Spacing.four,
    gap: Spacing.two,
    paddingBottom: Spacing.three,
  },
  paymentCard: {
    marginHorizontal: Spacing.four,
  },
  addTxn: {
    borderRadius: Radii.pill,
  },
  dateGroup: {
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.two,
  },
});
