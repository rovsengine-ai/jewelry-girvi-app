import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { EmptyState } from '@/components/empty-state';
import { Field } from '@/components/field';
import { MoneyText } from '@/components/money-text';
import { Row } from '@/components/row';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { asPaise, formatPaiseAsInr, todayInKolkata } from '@/lib/money';
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
          <Button label="← Back" variant="secondary" onPress={() => router.back()} />
          <EmptyState
            title="Owner only"
            body="Only the shop owner can renew a loan after the simple period."
          />
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
          <Button label="← Back" variant="secondary" onPress={() => router.back()} />
          <ThemedText type="subtitle">Renew {loan.serial_number}</ThemedText>
          <ThemedText type="small">{loan.profiles?.full_name ?? 'Unknown customer'}</ThemedText>

          <Card>
            <ThemedText type="smallBold">Interest-only renewal</ThemedText>
            <Row>
              <ThemedText type="small">Accrued interest due</ThemedText>
              <MoneyText paise={balances.accruedInterestPaise} />
            </Row>
            <Row>
              <ThemedText type="small">Principal stays</ThemedText>
              <MoneyText paise={balances.outstandingPrincipalPaise} />
            </Row>
            <ThemedText type="small">
              New due date: {defaultNewMaturityOn(asOf, loan.simple_period_days)}
            </ThemedText>
            <Field label="Optional note" value={note} onChangeText={setNote} />
          </Card>

          {!eligible ? (
            <ThemedText>
              Renewal is only offered after the simple period (
              {loan.simple_period_days} days from disbursal
              {latestMaturityOn ? `, currently due ${latestMaturityOn}` : ''}).
            </ThemedText>
          ) : (
            <Button
              testID="confirm-renew"
              label="Pay interest and renew"
              loading={isSaving}
              onPress={() => void handleRenew()}
            />
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
});
