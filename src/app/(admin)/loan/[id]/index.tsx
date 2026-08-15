import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
  asBps,
  asPaise,
  formatBpsAsPercent,
  formatPaiseAsInr,
  rupeesInputToPaise,
  todayInKolkata,
} from '@/lib/money';
import { mgToGramsInput } from '@/lib/weight';
import { buildPledgeAgreementHtml, buildRedemptionReceiptHtml } from '@/lib/print-documents';
import { kycStatusLabel } from '@/lib/kyc';
import { isRenewalEligible, loanStatusLabel } from '@/lib/redemption';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/providers/auth-provider';
import {
  fetchLoanBalances,
  fetchLoanCurrentDueOn,
  fetchLoanItems,
  logPayment,
  resolveReceiptDisplayUrl,
} from '@/services/loanService';
import { shareHtmlAsPdf } from '@/services/printService';
import type { LoanBalances, LoanItem, LoanWithCustomer, Payment } from '@/types/database';

export default function LoanDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const colors = useTheme();
  const { profile } = useAuth();
  const isOwner = profile?.role === 'owner';

  const [loan, setLoan] = useState<LoanWithCustomer | null>(null);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [balances, setBalances] = useState<LoanBalances | null>(null);
  const [receiptDisplayUrl, setReceiptDisplayUrl] = useState<string | null>(null);
  const [dueOn, setDueOn] = useState<string | null>(null);
  const [items, setItems] = useState<LoanItem[]>([]);
  const [amountRupees, setAmountRupees] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

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
      Alert.alert('Error', loanError.message);
      return;
    }
    if (paymentError) {
      Alert.alert('Error', paymentError.message);
      return;
    }

    setLoan(loanData as LoanWithCustomer | null);
    setPayments((paymentData ?? []) as Payment[]);

    if (loanData) {
      const [nextBalances, signed, nextDueOn, nextItems] = await Promise.all([
        fetchLoanBalances(id, todayInKolkata()),
        resolveReceiptDisplayUrl(loanData.receipt_image_url),
        fetchLoanCurrentDueOn(id),
        fetchLoanItems(id),
      ]);
      setBalances(nextBalances);
      setReceiptDisplayUrl(signed);
      setDueOn(nextDueOn);
      setItems(nextItems);
    } else {
      setReceiptDisplayUrl(null);
      setDueOn(null);
      setItems([]);
    }
  }, [id]);

  useEffect(() => {
    void (async () => {
      setIsLoading(true);
      try {
        await loadData();
      } catch (error) {
        Alert.alert('Error', error instanceof Error ? error.message : 'Failed to load balances');
      } finally {
        setIsLoading(false);
      }
    })();
  }, [loadData]);

  const handleLogPayment = async () => {
    if (!loan || !id) return;

    let amountPaise: number;
    try {
      amountPaise = rupeesInputToPaise(amountRupees);
    } catch (error) {
      Alert.alert('Invalid amount', error instanceof Error ? error.message : 'Unknown error');
      return;
    }

    setIsSaving(true);
    try {
      await logPayment(id, amountPaise, todayInKolkata());
      await loadData();
      setAmountRupees('');
      Alert.alert(
        'Saved',
        'Payment logged. Interest is allocated server-side (interest first). Closing the loan is a separate owner-only redemption.',
      );
    } catch (error) {
      Alert.alert('Failed', error instanceof Error ? error.message : 'Unknown error');
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading || !loan || !balances) {
    return (
      <ThemedView style={styles.centered}>
        <ActivityIndicator />
      </ThemedView>
    );
  }

  const asOf = todayInKolkata();
  const showRenew =
    isOwner && isRenewalEligible(loan.disbursed_on, loan.simple_period_days, asOf, dueOn);

  const printPledge = async () => {
    try {
      const html = buildPledgeAgreementHtml({
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
      await shareHtmlAsPdf(html, `Pledge ${loan.serial_number}`);
    } catch (error) {
      Alert.alert('Could not print', error instanceof Error ? error.message : 'Unknown error');
    }
  };

  const printRedemption = async () => {
    if (loan.status !== 'redeemed' || loan.closure_balance_paise == null || !loan.redeemed_on) {
      Alert.alert('Not redeemed', 'A redemption receipt is only available after owner redemption.');
      return;
    }
    try {
      const html = buildRedemptionReceiptHtml({
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
      await shareHtmlAsPdf(html, `Redemption ${loan.serial_number}`);
    } catch (error) {
      Alert.alert('Could not print', error instanceof Error ? error.message : 'Unknown error');
    }
  };

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <Pressable onPress={() => router.back()} style={styles.back}>
          <ThemedText type="smallBold">← Back</ThemedText>
        </Pressable>

        <ThemedText type="title">{loan.serial_number}</ThemedText>
        <ThemedText>{loan.profiles?.full_name ?? 'Unknown customer'}</ThemedText>
        <ThemedText type="small">{loan.profiles?.phone_number ?? '—'}</ThemedText>
        <ThemedText type="small" testID="loan-kyc-status">
          KYC: {kycStatusLabel(loan.profiles?.kyc_verified_on ?? null)}
        </ThemedText>
        <Pressable
          testID="open-kyc"
          onPress={() => router.push(`/(admin)/kyc/${loan.customer_id}`)}
          style={styles.back}>
          <ThemedText type="smallBold">Capture / verify KYC</ThemedText>
        </Pressable>

        {receiptDisplayUrl ? (
          <Image source={{ uri: receiptDisplayUrl }} style={styles.receipt} contentFit="cover" />
        ) : null}

        <View style={[styles.summaryCard, { backgroundColor: colors.backgroundElement }]}>
          <ThemedText type="smallBold">Loan Summary</ThemedText>
          <ThemedText type="small">
            {loan.item_name} · {loan.weight_grams}g · {formatBpsAsPercent(asBps(loan.rate_bps))}% / 30d ·{' '}
            {loan.interest_model}
          </ThemedText>
          <ThemedText type="small">Disbursed: {loan.disbursed_on}</ThemedText>
          <ThemedText type="small">Due: {dueOn ?? '—'}</ThemedText>
          <ThemedText type="small">
            Original principal: {formatPaiseAsInr(asPaise(loan.principal_paise))}
          </ThemedText>
          <ThemedText type="small">
            Interest paid: {formatPaiseAsInr(balances.interestPaidPaise)}
          </ThemedText>
          <ThemedText type="small">
            Principal paid: {formatPaiseAsInr(balances.principalPaidPaise)}
          </ThemedText>
          <ThemedText type="smallBold">
            Outstanding principal: {formatPaiseAsInr(balances.outstandingPrincipalPaise)}
          </ThemedText>
          <ThemedText type="smallBold">
            Accrued interest due: {formatPaiseAsInr(balances.accruedInterestPaise)}
          </ThemedText>
          <ThemedText type="smallBold">Total due: {formatPaiseAsInr(balances.totalDuePaise)}</ThemedText>
          <ThemedText type="small">Status: {loanStatusLabel(loan.status)}</ThemedText>
          {loan.status === 'redeemed' && loan.closure_balance_paise != null ? (
            <ThemedText type="small">
              Redeemed {loan.redeemed_on} · collected{' '}
              {formatPaiseAsInr(asPaise(loan.closure_balance_paise))} · released to{' '}
              {loan.released_to_name ?? '—'}
            </ThemedText>
          ) : null}
        </View>

        <View style={[styles.summaryCard, { backgroundColor: colors.backgroundElement }]}>
          <ThemedText type="smallBold">Pledged items</ThemedText>
          {items.length === 0 ? (
            <ThemedText type="small">No item rows on this loan.</ThemedText>
          ) : (
            items.map((item) => (
              <ThemedText type="small" key={item.id}>
                {item.metal ?? 'metal unknown'} · {item.ornament_type} ·{' '}
                {mgToGramsInput(item.net_weight_mg)}g net
                {item.purity_karat != null ? ` · ${item.purity_karat}K` : ' · purity not assessed'}
                {item.quantity > 1 ? ` · ×${item.quantity}` : ''}
              </ThemedText>
            ))
          )}
        </View>

        {loan.status === 'active' ? (
          <View style={styles.actionRow}>
            <Pressable
              testID="open-redeem"
              style={[styles.actionBtn, { backgroundColor: colors.backgroundSelected }]}
              onPress={() => router.push(`/(admin)/loan/${id}/redeem`)}>
              <ThemedText type="smallBold">Redeem</ThemedText>
            </Pressable>
            {showRenew ? (
              <Pressable
                testID="open-renew"
                style={[styles.actionBtn, { backgroundColor: colors.backgroundSelected }]}
                onPress={() => router.push(`/(admin)/loan/${id}/renew`)}>
                <ThemedText type="smallBold">Renew</ThemedText>
              </Pressable>
            ) : null}
          </View>
        ) : null}

        <View style={styles.actionRow}>
          <Pressable
            testID="print-pledge"
            style={[styles.actionBtn, { backgroundColor: colors.backgroundSelected }]}
            onPress={() => void printPledge()}>
            <ThemedText type="smallBold">Print pledge</ThemedText>
          </Pressable>
          {loan.status === 'redeemed' ? (
            <Pressable
              testID="print-redemption"
              style={[styles.actionBtn, { backgroundColor: colors.backgroundSelected }]}
              onPress={() => void printRedemption()}>
              <ThemedText type="smallBold">Print receipt</ThemedText>
            </Pressable>
          ) : null}
        </View>

        {loan.status === 'active' ? (
          <View style={[styles.paymentForm, { backgroundColor: colors.backgroundElement }]}>
            <ThemedText type="smallBold">Record Payment</ThemedText>
            <ThemedText type="small">Server allocates to accrued interest first, then principal.</ThemedText>
            <TextInput
              value={amountRupees}
              onChangeText={setAmountRupees}
              placeholder="Amount in ₹"
              keyboardType="numeric"
              placeholderTextColor={colors.textSecondary}
              style={[styles.input, { borderColor: colors.backgroundSelected, color: colors.text }]}
            />
            <Pressable
              style={[styles.saveBtn, { backgroundColor: colors.backgroundSelected }]}
              onPress={() => void handleLogPayment()}
              disabled={isSaving}>
              {isSaving ? <ActivityIndicator /> : <ThemedText type="smallBold">Record Payment</ThemedText>}
            </Pressable>
          </View>
        ) : null}

        <ThemedText type="smallBold" style={styles.historyTitle}>
          Payment History
        </ThemedText>
        <FlatList
          data={payments}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.historyList}
          ListEmptyComponent={<ThemedText type="small">No payments recorded yet.</ThemedText>}
          renderItem={({ item }) => (
            <View style={[styles.historyRow, { backgroundColor: colors.backgroundElement }]}>
              <ThemedText type="smallBold">{formatPaiseAsInr(asPaise(item.amount_paid_paise))}</ThemedText>
              <ThemedText type="small">Paid on {item.paid_on}</ThemedText>
            </View>
          )}
        />
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1, paddingHorizontal: Spacing.four },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  back: { paddingVertical: Spacing.two },
  receipt: { width: '100%', height: 180, borderRadius: 12, marginVertical: Spacing.two },
  summaryCard: { borderRadius: 14, padding: Spacing.three, gap: Spacing.one, marginBottom: Spacing.three },
  actionRow: { flexDirection: 'row', gap: Spacing.two, marginBottom: Spacing.three },
  actionBtn: { flex: 1, borderRadius: 10, paddingVertical: Spacing.two, alignItems: 'center' },
  paymentForm: { borderRadius: 14, padding: Spacing.three, gap: Spacing.two, marginBottom: Spacing.three },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: Spacing.three, paddingVertical: Spacing.two },
  saveBtn: { borderRadius: 10, paddingVertical: Spacing.two, alignItems: 'center' },
  historyTitle: { marginBottom: Spacing.two },
  historyList: { gap: Spacing.two, paddingBottom: Spacing.five },
  historyRow: { borderRadius: 10, padding: Spacing.two, gap: Spacing.one },
});
