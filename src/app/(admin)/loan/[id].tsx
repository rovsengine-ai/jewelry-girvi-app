import { useCallback, useEffect, useMemo, useState } from 'react';
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
import { supabase } from '@/lib/supabase';
import {
  calculateLoanBalances,
  closeLoanIfFullyPaid,
  logPayment,
} from '@/services/loanService';
import type { LoanWithCustomer, Payment, PaymentType } from '@/types/database';

function formatInr(value: number): string {
  return `₹${value.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
}

export default function LoanDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const colors = useTheme();

  const [loan, setLoan] = useState<LoanWithCustomer | null>(null);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [amount, setAmount] = useState('');
  const [paymentType, setPaymentType] = useState<PaymentType>('interest');
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
        supabase.from('payments').select('*').eq('loan_id', id).order('created_at', { ascending: false }),
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
  }, [id]);

  useEffect(() => {
    void (async () => {
      setIsLoading(true);
      await loadData();
      setIsLoading(false);
    })();
  }, [loadData]);

  const balances = useMemo(() => {
    if (!loan) {
      return null;
    }
    return calculateLoanBalances(
      Number(loan.loan_amount),
      Number(loan.interest_rate_monthly),
      payments,
      loan.created_at,
    );
  }, [loan, payments]);

  const handleLogPayment = async () => {
    if (!loan || !id) return;

    const parsedAmount = Number(amount);
    if (!parsedAmount || parsedAmount <= 0) {
      Alert.alert('Invalid amount', 'Enter a payment amount greater than zero.');
      return;
    }

    setIsSaving(true);
    try {
      await logPayment(id, parsedAmount, paymentType);
      await loadData();

      if (balances && paymentType === 'principal') {
        const nextRemaining = Math.max(balances.remainingPrincipal - parsedAmount, 0);
        await closeLoanIfFullyPaid(id, nextRemaining);
        await loadData();
      }

      setAmount('');
      Alert.alert('Saved', 'Payment logged successfully.');
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

        {loan.receipt_image_url ? (
          <Image source={{ uri: loan.receipt_image_url }} style={styles.receipt} contentFit="cover" />
        ) : null}

        <View style={[styles.summaryCard, { backgroundColor: colors.backgroundElement }]}>
          <ThemedText type="smallBold">Loan Summary</ThemedText>
          <ThemedText type="small">
            {loan.item_name} · {loan.weight_grams}g · {loan.interest_rate_monthly}% monthly
          </ThemedText>
          <ThemedText type="small">Original principal: {formatInr(Number(loan.loan_amount))}</ThemedText>
          <ThemedText type="small">Principal paid: {formatInr(balances.principalPaid)}</ThemedText>
          <ThemedText type="small">Interest paid: {formatInr(balances.interestPaid)}</ThemedText>
          <ThemedText type="smallBold">Remaining principal: {formatInr(balances.remainingPrincipal)}</ThemedText>
          <ThemedText type="small">Est. accrued interest due: {formatInr(balances.accruedInterestEstimate)}</ThemedText>
          <ThemedText type="small">Status: {loan.status === 'active' ? 'Active' : 'Closed'}</ThemedText>
        </View>

        <View style={[styles.paymentForm, { backgroundColor: colors.backgroundElement }]}>
          <ThemedText type="smallBold">Log Partial Payment</ThemedText>
          <View style={styles.typeRow}>
            {(['interest', 'principal'] as PaymentType[]).map((type) => (
              <Pressable
                key={type}
                onPress={() => setPaymentType(type)}
                style={[
                  styles.typeChip,
                  {
                    backgroundColor:
                      paymentType === type ? colors.backgroundSelected : colors.background,
                  },
                ]}>
                <ThemedText type="smallBold">{type === 'interest' ? 'Interest' : 'Principal'}</ThemedText>
              </Pressable>
            ))}
          </View>
          <TextInput
            value={amount}
            onChangeText={setAmount}
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
              <ThemedText type="smallBold">{item.payment_type === 'interest' ? 'Interest' : 'Principal'}</ThemedText>
              <ThemedText type="small">{formatInr(Number(item.amount_paid))}</ThemedText>
              <ThemedText type="small">{new Date(item.created_at).toLocaleString('en-IN')}</ThemedText>
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
  typeRow: { flexDirection: 'row', gap: Spacing.two },
  typeChip: { borderRadius: 999, paddingHorizontal: Spacing.three, paddingVertical: Spacing.one },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: Spacing.three, paddingVertical: Spacing.two },
  saveBtn: { borderRadius: 10, paddingVertical: Spacing.two, alignItems: 'center' },
  historyTitle: { marginBottom: Spacing.two },
  historyList: { gap: Spacing.two, paddingBottom: Spacing.five },
  historyRow: { borderRadius: 10, padding: Spacing.two, gap: Spacing.one },
});
