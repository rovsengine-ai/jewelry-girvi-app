import { useCallback, useEffect, useMemo, useRef, useState, type ComponentRef } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import SignatureCanvas from 'react-native-signature-canvas';

import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { EmptyState } from '@/components/empty-state';
import { Field } from '@/components/field';
import { ItemReleaseChecklist } from '@/components/item-release-checklist';
import { MoneyText } from '@/components/money-text';
import { Row } from '@/components/row';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Radii, Spacing } from '@/constants/theme';
import {
  asPaise,
  formatPaiseAsInr,
  paiseToRupeesInput,
  rupeesInputToPaise,
  todayInKolkata,
} from '@/lib/money';
import { canSubmitRedemption, parseOwnerOnlyError, redeemGate } from '@/lib/redemption';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/providers/auth-provider';
import {
  fetchLoanBalances,
  fetchLoanItems,
  redeemLoan,
  uploadSignatureDataUrl,
} from '@/services/loanService';
import type { LoanBalances, LoanItem, LoanWithCustomer } from '@/types/database';

export default function RedeemLoanScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { profile } = useAuth();
  const signatureRef = useRef<ComponentRef<typeof SignatureCanvas> | null>(null);

  const [loan, setLoan] = useState<LoanWithCustomer | null>(null);
  const [items, setItems] = useState<LoanItem[]>([]);
  const [balances, setBalances] = useState<LoanBalances | null>(null);
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());
  const [releasedToName, setReleasedToName] = useState('');
  const [releaseNote, setReleaseNote] = useState('');
  const [amountRupees, setAmountRupees] = useState('');
  const [signatureDataUrl, setSignatureDataUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const gate = redeemGate(profile?.role, loan?.status);
  const itemIds = useMemo(() => items.map((item) => item.id), [items]);

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
      setItems([]);
      setBalances(null);
      return;
    }
    const [nextItems, nextBalances] = await Promise.all([
      fetchLoanItems(id),
      fetchLoanBalances(id, todayInKolkata()),
    ]);
    setItems(nextItems);
    setBalances(nextBalances);
    setReleasedToName((current) => current || nextLoan.profiles?.full_name || '');
    if (nextBalances.totalDuePaise > 0) {
      setAmountRupees(paiseToRupeesInput(nextBalances.totalDuePaise));
    } else {
      setAmountRupees('');
    }
  }, [id]);

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

  const toggleItem = (itemId: string) => {
    setCheckedIds((prev) => {
      const next = new Set(prev);
      if (next.has(itemId)) {
        next.delete(itemId);
      } else {
        next.add(itemId);
      }
      return next;
    });
  };

  const handleRedeem = async () => {
    if (!id || !loan || !balances) return;

    const submit = canSubmitRedemption({
      releasedToName,
      itemIds,
      checkedIds,
    });
    if (!submit.ok) {
      Alert.alert('Cannot redeem', submit.reason);
      return;
    }

    let finalPaymentPaise = 0;
    const trimmed = amountRupees.trim();
    if (trimmed !== '' && trimmed !== '0') {
      try {
        finalPaymentPaise = rupeesInputToPaise(trimmed);
      } catch (error) {
        Alert.alert('Invalid amount', error instanceof Error ? error.message : 'Unknown error');
        return;
      }
    }

    setIsSaving(true);
    try {
      let signaturePath: string | null = null;
      if (signatureDataUrl) {
        signaturePath = await uploadSignatureDataUrl(signatureDataUrl, loan.customer_id);
      }

      const result = await redeemLoan({
        loanId: id,
        redeemedOn: todayInKolkata(),
        releasedToName,
        itemIds,
        finalPaymentPaise,
        releaseNote: releaseNote.trim() || null,
        releaseSignatureUrl: signaturePath,
      });

      Alert.alert(
        result.already_redeemed ? 'Already redeemed' : 'Redeemed',
        `Collected ${formatPaiseAsInr(asPaise(result.closure_balance_paise))} on ${result.redeemed_on}.`,
        [{ text: 'OK', onPress: () => router.replace(`/(admin)/loan/${id}`) }],
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      if (parseOwnerOnlyError(message)) {
        Alert.alert('Owner only', 'Only the shop owner can redeem a loan.');
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
          <ThemedText type="subtitle">Owner only</ThemedText>
          <EmptyState
            title="Owner only"
            body="Only the shop owner can redeem a loan and release pledged goods. Ask the owner to complete this at the counter."
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

  if (gate.kind === 'already_redeemed') {
    return (
      <ThemedView style={styles.container}>
        <SafeAreaView style={styles.safeArea}>
          <Button label="← Back" variant="secondary" onPress={() => router.back()} />
          <ThemedText type="subtitle">Already redeemed</ThemedText>
          <ThemedText>
            Released to {loan.released_to_name ?? '—'} on {loan.redeemed_on}.
          </ThemedText>
          {loan.closure_balance_paise != null ? (
            <MoneyText paise={asPaise(loan.closure_balance_paise)} />
          ) : null}
        </SafeAreaView>
      </ThemedView>
    );
  }

  if (gate.kind === 'not_active') {
    return (
      <ThemedView style={styles.container}>
        <SafeAreaView style={styles.safeArea}>
          <Button label="← Back" variant="secondary" onPress={() => router.back()} />
          <ThemedText type="subtitle">Cannot redeem</ThemedText>
          <ThemedText>This loan is {gate.status} and cannot be redeemed.</ThemedText>
        </SafeAreaView>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.scroll}>
          <Button label="← Back" variant="secondary" onPress={() => router.back()} />
          <ThemedText type="subtitle">Redeem {loan.serial_number}</ThemedText>
          <ThemedText type="small">{loan.profiles?.full_name ?? 'Unknown customer'}</ThemedText>

          <Card>
            <ThemedText type="smallBold">Balances today (server)</ThemedText>
            <Row>
              <ThemedText type="small">Principal</ThemedText>
              <MoneyText paise={balances.outstandingPrincipalPaise} />
            </Row>
            <Row>
              <ThemedText type="small">Accrued interest</ThemedText>
              <MoneyText paise={balances.accruedInterestPaise} />
            </Row>
            <Row>
              <ThemedText type="smallBold">Total due</ThemedText>
              <MoneyText paise={balances.totalDuePaise} />
            </Row>
          </Card>

          <Card>
            <ThemedText type="smallBold">Final payment</ThemedText>
            <ThemedText type="small">Leave empty if the due amount is already cleared.</ThemedText>
            <Field
              label="Amount in ₹"
              value={amountRupees}
              onChangeText={setAmountRupees}
              keyboardType="numeric"
            />
          </Card>

          <Card>
            <ThemedText type="smallBold">Release checklist</ThemedText>
            <ThemedText type="small">
              Tick every ornament before handing them back. There is no select-all.
            </ThemedText>
            <ItemReleaseChecklist items={items} checkedIds={checkedIds} onToggle={toggleItem} />
          </Card>

          <Card>
            <ThemedText type="smallBold">Collected by</ThemedText>
            <Field
              label="Name of the person collecting"
              value={releasedToName}
              onChangeText={setReleasedToName}
            />
            <Field label="Optional note" value={releaseNote} onChangeText={setReleaseNote} />
          </Card>

          <Card>
            <ThemedText type="smallBold">Second signature (optional)</ThemedText>
            <View style={styles.signatureBox}>
              <SignatureCanvas
                ref={signatureRef}
                onOK={(sig) => setSignatureDataUrl(sig)}
                onEmpty={() => setSignatureDataUrl(null)}
                autoClear={false}
                webStyle={`.m-signature-pad { box-shadow: none; border: none; }`}
                style={styles.signatureCanvas}
              />
            </View>
          </Card>

          <Button
            testID="confirm-redeem"
            label="Confirm redemption"
            loading={isSaving}
            onPress={() => void handleRedeem()}
          />
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
  signatureBox: { height: 180, borderRadius: Radii.md, overflow: 'hidden' },
  signatureCanvas: { flex: 1 },
});
