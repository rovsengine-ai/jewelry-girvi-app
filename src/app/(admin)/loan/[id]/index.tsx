import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  StyleSheet,
} from 'react-native';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Badge } from '@/components/badge';
import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { EmptyState } from '@/components/empty-state';
import { Field } from '@/components/field';
import { MoneyText } from '@/components/money-text';
import { Row } from '@/components/row';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Radii, Spacing } from '@/constants/theme';
import {
  asBps,
  asPaise,
  formatBpsAsPercent,
  rupeesInputToPaise,
  todayInKolkata,
} from '@/lib/money';
import { mgToGramsInput } from '@/lib/weight';
import { buildPledgeAgreementHtml, buildRedemptionReceiptHtml } from '@/lib/print-documents';
import { kycStatusLabel } from '@/lib/kyc';
import { isRenewalEligible } from '@/lib/redemption';
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
        <Button label="← Back" variant="secondary" onPress={() => router.back()} />

        <ThemedText type="subtitle">{loan.serial_number}</ThemedText>
        <ThemedText>{loan.profiles?.full_name ?? 'Unknown customer'}</ThemedText>
        <ThemedText type="small">{loan.profiles?.phone_number ?? '—'}</ThemedText>
        <ThemedText type="small" testID="loan-kyc-status">
          KYC: {kycStatusLabel(loan.profiles?.kyc_verified_on ?? null)}
        </ThemedText>
        <Button
          testID="open-kyc"
          label="Capture / verify KYC"
          variant="secondary"
          onPress={() => router.push(`/(admin)/kyc/${loan.customer_id}`)}
        />

        {receiptDisplayUrl ? (
          <Image source={{ uri: receiptDisplayUrl }} style={styles.receipt} contentFit="cover" />
        ) : null}

        <Card>
          <Row>
            <ThemedText type="smallBold">Loan Summary</ThemedText>
            <Badge status={loan.status} />
          </Row>
          <ThemedText type="small">
            {loan.item_name} · {loan.weight_grams}g · {formatBpsAsPercent(asBps(loan.rate_bps))}% / 30d ·{' '}
            {loan.interest_model}
          </ThemedText>
          <ThemedText type="small">Disbursed: {loan.disbursed_on}</ThemedText>
          <ThemedText type="small">Due: {dueOn ?? '—'}</ThemedText>
          <Row>
            <ThemedText type="small">Original principal</ThemedText>
            <MoneyText paise={asPaise(loan.principal_paise)} />
          </Row>
          <Row>
            <ThemedText type="small">Interest paid</ThemedText>
            <MoneyText paise={balances.interestPaidPaise} />
          </Row>
          <Row>
            <ThemedText type="small">Principal paid</ThemedText>
            <MoneyText paise={balances.principalPaidPaise} />
          </Row>
          <Row>
            <ThemedText type="smallBold">Outstanding principal</ThemedText>
            <MoneyText paise={balances.outstandingPrincipalPaise} />
          </Row>
          <Row>
            <ThemedText type="smallBold">Accrued interest due</ThemedText>
            <MoneyText paise={balances.accruedInterestPaise} />
          </Row>
          <Row>
            <ThemedText type="smallBold">Total due</ThemedText>
            <MoneyText paise={balances.totalDuePaise} />
          </Row>
          {loan.status === 'redeemed' && loan.closure_balance_paise != null ? (
            <Row>
              <ThemedText type="small">
                Redeemed {loan.redeemed_on} · released to {loan.released_to_name ?? '—'}
              </ThemedText>
              <MoneyText paise={asPaise(loan.closure_balance_paise)} />
            </Row>
          ) : null}
        </Card>

        <Card>
          <ThemedText type="smallBold">Pledged items</ThemedText>
          {items.length === 0 ? (
            <EmptyState title="No items" body="No item rows on this loan." />
          ) : (
            items.map((item) => (
              <Row key={item.id} style={styles.itemRow}>
                <ThemedText type="small" style={styles.itemMeta}>
                  {item.metal ?? 'metal unknown'} · {item.ornament_type} ·{' '}
                  {mgToGramsInput(item.net_weight_mg)}g net
                  {item.purity_karat != null ? ` · ${item.purity_karat}K` : ' · purity not assessed'}
                  {item.quantity > 1 ? ` · ×${item.quantity}` : ''}
                  {item.valuation_paise != null ? ' · assessed (not IBJA)' : ''}
                </ThemedText>
                {item.valuation_paise != null ? (
                  <MoneyText paise={asPaise(item.valuation_paise)} />
                ) : null}
              </Row>
            ))
          )}
        </Card>

        {loan.status === 'active' ? (
          <Row>
            <Button
              testID="open-redeem"
              label="Redeem"
              onPress={() => router.push(`/(admin)/loan/${id}/redeem`)}
            />
            {showRenew ? (
              <Button
                testID="open-renew"
                label="Renew"
                variant="secondary"
                onPress={() => router.push(`/(admin)/loan/${id}/renew`)}
              />
            ) : null}
          </Row>
        ) : null}

        <Row>
          <Button testID="print-pledge" label="Print pledge" variant="secondary" onPress={() => void printPledge()} />
          {loan.status === 'redeemed' ? (
            <Button
              testID="print-redemption"
              label="Print receipt"
              variant="secondary"
              onPress={() => void printRedemption()}
            />
          ) : null}
        </Row>

        {loan.status === 'active' ? (
          <Card>
            <ThemedText type="smallBold">Record Payment</ThemedText>
            <ThemedText type="small">Server allocates to accrued interest first, then principal.</ThemedText>
            <Field
              label="Amount in ₹"
              value={amountRupees}
              onChangeText={setAmountRupees}
              keyboardType="numeric"
            />
            <Button
              label="Record Payment"
              loading={isSaving}
              onPress={() => void handleLogPayment()}
            />
          </Card>
        ) : null}

        <ThemedText type="smallBold">Payment History</ThemedText>
        <FlatList
          data={payments}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.historyList}
          ListEmptyComponent={<EmptyState title="No payments" body="No payments recorded yet." />}
          renderItem={({ item }) => (
            <Card>
              <Row>
                <ThemedText type="small">Paid on {item.paid_on}</ThemedText>
                <MoneyText paise={asPaise(item.amount_paid_paise)} />
              </Row>
            </Card>
          )}
        />
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1, paddingHorizontal: Spacing.four, gap: Spacing.two },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  receipt: { width: '100%', height: 180, borderRadius: Radii.md, marginVertical: Spacing.two },
  itemRow: { flexWrap: 'wrap' },
  itemMeta: { flex: 1 },
  historyList: { gap: Spacing.two, paddingBottom: Spacing.five },
});
