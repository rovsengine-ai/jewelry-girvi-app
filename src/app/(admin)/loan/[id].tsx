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
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/providers/auth-provider';
import {
  closeLoanIfFullyPaid,
  fetchLoanBalances,
  logPayment,
  resolveReceiptDisplayUrl,
} from '@/services/loanService';
import type { LoanBalances, LoanWithCustomer, Payment } from '@/types/database';

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
            profiles:customer_id ( full_name, phone_number, address, role )
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
      const nextBalances = await fetchLoanBalances(id, todayInKolkata());
      setBalances(nextBalances);
      const signed = await resolveReceiptDisplayUrl(loanData.receipt_image_url);
      setReceiptDisplayUrl(signed);
    } else {
      setReceiptDisplayUrl(null);
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
      if (isOwner) {
        await closeLoanIfFullyPaid(id, todayInKolkata());
      }
      await loadData();
      setAmountRupees('');
      Alert.alert(
        'Saved',
        isOwner
          ? 'Payment logged. Interest is allocated server-side (interest first).'
          : 'Payment logged. An owner must close the loan after full payoff.',
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

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <Pressable onPress={() => router.back()} style={styles.back}>
          <ThemedText type="smallBold">← Back</ThemedText>
        </Pressable>

        <ThemedText type="title">{loan.serial_number}</ThemedText>
        <ThemedText>{loan.profiles?.full_name ?? 'Unknown customer'}</ThemedText>
        <ThemedText type="small">{loan.profiles?.phone_number ?? '—'}</ThemedText>

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
          <ThemedText type="small">Status: {loan.status === 'active' ? 'Active' : 'Closed'}</ThemedText>
        </View>

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
  paymentForm: { borderRadius: 14, padding: Spacing.three, gap: Spacing.two, marginBottom: Spacing.three },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: Spacing.three, paddingVertical: Spacing.two },
  saveBtn: { borderRadius: 10, paddingVertical: Spacing.two, alignItems: 'center' },
  historyTitle: { marginBottom: Spacing.two },
  historyList: { gap: Spacing.two, paddingBottom: Spacing.five },
  historyRow: { borderRadius: 10, padding: Spacing.two, gap: Spacing.one },
});
