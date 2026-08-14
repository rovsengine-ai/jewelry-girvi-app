import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { asPaise, formatPaiseAsInr, paiseToRupeesInput, todayInKolkata } from '@/lib/money';
import {
  defaultNewMaturityOn,
  isRenewalEligible,
  parseOwnerOnlyError,
  redeemGate,
} from '@/lib/redemption';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/providers/auth-provider';
import { fetchLatestMaturityOn, fetchLoanBalances, renewLoan } from '@/services/loanService';
import type { LoanBalances, LoanWithCustomer } from '@/types/database';

export default function RenewLoanScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const colors = useTheme();
  const { profile } = useAuth();

  const [loan, setLoan] = useState<LoanWithCustomer | null>(null);
  const [balances, setBalances] = useState<LoanBalances | null>(null);
  const [latestMaturityOn, setLatestMaturityOn] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const asOf = todayInKolkata();
  const gate = redeemGate(profile?.role, loan?.status);

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
      try {
        await load();
      } catch (error) {
        Alert.alert('Error', error instanceof Error ? error.message : 'Failed to load loan');
      } finally {
        setIsLoading(false);
      }
    })();
  }, [load]);

  const handleRenew = async () => {
    if (!id || !loan || !balances) return;
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
      Alert.alert(
        result.already_renewed ? 'Already renewed today' : 'Renewed',
        `Interest ${formatPaiseAsInr(asPaise(result.interest_paid_paise))} · new due ${result.new_maturity_on}.`,
        [{ text: 'OK', onPress: () => router.replace(`/(admin)/loan/${id}`) }],
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      if (parseOwnerOnlyError(message)) {
        Alert.alert('Owner only', 'Only the shop owner can renew a loan.');
      } else {
        Alert.alert('Failed', message);
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

  if (gate.kind === 'owner_only') {
    return (
      <ThemedView style={styles.container}>
        <SafeAreaView style={styles.safeArea}>
          <Pressable onPress={() => router.back()} style={styles.back}>
            <ThemedText type="smallBold">← Back</ThemedText>
          </Pressable>
          <ThemedText type="title">Owner only</ThemedText>
          <ThemedText>Only the shop owner can renew a loan after the simple period.</ThemedText>
        </SafeAreaView>
      </ThemedView>
    );
  }

  if (!loan || !balances) {
    return (
      <ThemedView style={styles.centered}>
        <ThemedText>Loan not found.</ThemedText>
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
      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.scroll}>
          <Pressable onPress={() => router.back()} style={styles.back}>
            <ThemedText type="smallBold">← Back</ThemedText>
          </Pressable>
          <ThemedText type="title">Renew {loan.serial_number}</ThemedText>
          <ThemedText type="small">{loan.profiles?.full_name ?? 'Unknown customer'}</ThemedText>

          <View style={[styles.card, { backgroundColor: colors.backgroundElement }]}>
            <ThemedText type="smallBold">Interest-only renewal</ThemedText>
            <ThemedText type="small">
              Accrued interest due: {formatPaiseAsInr(balances.accruedInterestPaise)}
            </ThemedText>
            <ThemedText type="small">
              Principal stays {formatPaiseAsInr(balances.outstandingPrincipalPaise)}
            </ThemedText>
            <ThemedText type="small">
              New due date: {defaultNewMaturityOn(asOf, loan.simple_period_days)}
            </ThemedText>
            <TextInput
              value={note}
              onChangeText={setNote}
              placeholder="Optional note"
              placeholderTextColor={colors.textSecondary}
              style={[styles.input, { borderColor: colors.backgroundSelected, color: colors.text }]}
            />
          </View>

          {!eligible ? (
            <ThemedText>
              Renewal is only offered after the simple period (
              {loan.simple_period_days} days from disbursal
              {latestMaturityOn ? `, currently due ${latestMaturityOn}` : ''}).
            </ThemedText>
          ) : (
            <Pressable
              testID="confirm-renew"
              style={[styles.saveBtn, { backgroundColor: colors.backgroundSelected }]}
              onPress={() => void handleRenew()}
              disabled={isSaving}>
              {isSaving ? (
                <ActivityIndicator />
              ) : (
                <ThemedText type="smallBold">
                  Pay {paiseToRupeesInput(balances.accruedInterestPaise)} interest and renew
                </ThemedText>
              )}
            </Pressable>
          )}
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  scroll: { paddingHorizontal: Spacing.four, paddingBottom: Spacing.five, gap: Spacing.three },
  back: { paddingVertical: Spacing.two },
  card: { borderRadius: 14, padding: Spacing.three, gap: Spacing.two },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: Spacing.three, paddingVertical: Spacing.two },
  saveBtn: { borderRadius: 10, paddingVertical: Spacing.two, alignItems: 'center' },
});
