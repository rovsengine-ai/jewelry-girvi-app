import { useCallback, useEffect, useMemo, useRef, useState, type ComponentRef } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import SignatureCanvas from 'react-native-signature-canvas';

import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { EmptyState } from '@/components/empty-state';
import { Field } from '@/components/field';
import { FormNotice } from '@/components/form-notice';
import { ItemReleaseChecklist } from '@/components/item-release-checklist';
import { MoneyText } from '@/components/money-text';
import { Row } from '@/components/row';
import { ScreenHeader } from '@/components/screen-header';
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
import { canSubmitRedemption, loanStatusLabel, parseOwnerOnlyError, redeemGate } from '@/lib/redemption';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/providers/auth-provider';
import { useLanguage } from '@/providers/language-provider';
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
  const { t, language } = useLanguage();
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
  const [loadError, setLoadError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [doneNotice, setDoneNotice] = useState<string | null>(null);

  const gate = redeemGate(profile?.role, loan?.status);
  const itemIds = useMemo(() => items.map((item) => item.id), [items]);
  const headerTitle = loan
    ? t('redeem.title', { serial: loan.serial_number })
    : t('loans.detail.redeem');

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
      setLoadError(null);
      try {
        await load();
      } catch (error) {
        setLoadError(error instanceof Error ? error.message : t('errors.failedLoadLoan'));
      } finally {
        setIsLoading(false);
      }
    })();
  }, [load, t]);

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
    setFormError(null);

    const submit = canSubmitRedemption({
      releasedToName,
      itemIds,
      checkedIds,
    });
    if (!submit.ok) {
      setFormError(t(submit.reason));
      return;
    }

    let finalPaymentPaise = 0;
    const trimmed = amountRupees.trim();
    if (trimmed !== '' && trimmed !== '0') {
      try {
        finalPaymentPaise = rupeesInputToPaise(trimmed);
      } catch (error) {
        setFormError(error instanceof Error ? error.message : t('errors.unknown'));
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

      setDoneNotice(
        t('redeem.successBody', {
          amount: formatPaiseAsInr(asPaise(result.closure_balance_paise)),
          date: result.redeemed_on,
        }),
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : t('errors.unknown');
      if (parseOwnerOnlyError(message)) {
        setFormError(t('redeem.ownerOnlyError'));
      } else {
        setFormError(message);
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

  if (loadError) {
    return (
      <ThemedView style={styles.container}>
        <ScreenHeader title={t('loans.detail.redeem')} />
        <View style={styles.body}>
          <Button label={t('common.back')} variant="secondary" onPress={() => router.back()} />
          <EmptyState title={t('loans.detail.loadErrorTitle')} body={loadError} />
        </View>
      </ThemedView>
    );
  }

  if (doneNotice) {
    return (
      <ThemedView style={styles.container}>
        <ScreenHeader title={t('redeem.successTitle')} />
        <View style={styles.body}>
          <EmptyState
            title={t('redeem.successTitle')}
            body={doneNotice}
            actionLabel={t('common.backToLoan')}
            onAction={() => router.replace(`/(admin)/loan/${id}`)}
          />
        </View>
      </ThemedView>
    );
  }

  if (gate.kind === 'owner_only') {
    return (
      <ThemedView style={styles.container}>
        <ScreenHeader title={t('redeem.ownerOnlyTitle')} />
        <View style={styles.body}>
          <Button label={t('common.back')} variant="secondary" onPress={() => router.back()} />
          <EmptyState title={t('redeem.ownerOnlyTitle')} body={t('redeem.ownerOnlyBody')} />
        </View>
      </ThemedView>
    );
  }

  if (!loan || !balances) {
    return (
      <ThemedView style={styles.container}>
        <ScreenHeader title={t('loans.detail.redeem')} />
        <View style={styles.body}>
          <Button label={t('common.back')} variant="secondary" onPress={() => router.back()} />
          <EmptyState title={t('loans.detail.notFoundTitle')} body={t('loans.detail.notFoundBody')} />
        </View>
      </ThemedView>
    );
  }

  if (gate.kind === 'already_redeemed') {
    return (
      <ThemedView style={styles.container}>
        <ScreenHeader title={t('redeem.alreadyTitle')} />
        <View style={styles.body}>
          <Button label={t('common.back')} variant="secondary" onPress={() => router.back()} />
          <ThemedText>
            {t('redeem.alreadyBody', {
              name: loan.released_to_name ?? t('common.emDash'),
              date: loan.redeemed_on ?? t('common.emDash'),
            })}
          </ThemedText>
          {loan.closure_balance_paise != null ? (
            <MoneyText paise={asPaise(loan.closure_balance_paise)} />
          ) : null}
        </View>
      </ThemedView>
    );
  }

  if (gate.kind === 'not_active') {
    return (
      <ThemedView style={styles.container}>
        <ScreenHeader title={t('redeem.cannotTitle')} />
        <View style={styles.body}>
          <Button label={t('common.back')} variant="secondary" onPress={() => router.back()} />
          <ThemedText>
            {t('redeem.cannotBody', { status: loanStatusLabel(gate.status, language) })}
          </ThemedText>
        </View>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <ScreenHeader title={headerTitle} />
      <ScrollView contentContainerStyle={styles.scroll}>
        <Button label={t('common.back')} variant="secondary" onPress={() => router.back()} />
        <ThemedText type="small">{loan.profiles?.full_name ?? t('common.unknownCustomer')}</ThemedText>
        <FormNotice error={formError} />

        <Card>
          <ThemedText type="smallBold">{t('redeem.balancesTitle')}</ThemedText>
          <Row>
            <ThemedText type="small">{t('redeem.principal')}</ThemedText>
            <MoneyText paise={balances.outstandingPrincipalPaise} />
          </Row>
          <Row>
            <ThemedText type="small">{t('redeem.accruedInterest')}</ThemedText>
            <MoneyText paise={balances.accruedInterestPaise} />
          </Row>
          <Row>
            <ThemedText type="smallBold">{t('redeem.totalDue')}</ThemedText>
            <MoneyText paise={balances.totalDuePaise} />
          </Row>
        </Card>

        <Card>
          <ThemedText type="smallBold">{t('redeem.finalPaymentTitle')}</ThemedText>
          <ThemedText type="small">{t('redeem.finalPaymentHint')}</ThemedText>
          <Field
            label={t('redeem.amountInRupees')}
            value={amountRupees}
            onChangeText={setAmountRupees}
            keyboardType="numeric"
            testID="redeem-amount"
          />
        </Card>

        <Card>
          <ThemedText type="smallBold">{t('redeem.checklistTitle')}</ThemedText>
          <ThemedText type="small">{t('redeem.checklistHint')}</ThemedText>
          <ItemReleaseChecklist items={items} checkedIds={checkedIds} onToggle={toggleItem} />
        </Card>

        <Card>
          <ThemedText type="smallBold">{t('redeem.collectedBy')}</ThemedText>
          <Field
            label={t('redeem.collectorName')}
            value={releasedToName}
            onChangeText={setReleasedToName}
            testID="redeem-collector"
          />
          <Field label={t('redeem.optionalNote')} value={releaseNote} onChangeText={setReleaseNote} />
        </Card>

        <Card>
          <ThemedText type="smallBold">{t('redeem.signatureTitle')}</ThemedText>
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
          label={t('redeem.confirm')}
          loading={isSaving}
          onPress={() => void handleRedeem()}
        />
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  body: { flex: 1, paddingHorizontal: Spacing.four, gap: Spacing.two },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  scroll: { paddingHorizontal: Spacing.four, paddingBottom: Spacing.five, gap: Spacing.three },
  signatureBox: { height: 180, borderRadius: Radii.md, overflow: 'hidden' },
  signatureCanvas: { flex: 1 },
});
