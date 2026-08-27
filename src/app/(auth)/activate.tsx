/**
 * Counter QR deep link: redeem login token, set PIN, open customer loans.
 * Linking: https://docs.expo.dev/versions/v57.0.0/sdk/linking/
 * Router: https://docs.expo.dev/versions/v57.0.0/sdk/router/
 */
import { useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { Field } from '@/components/field';
import { FormNotice } from '@/components/form-notice';
import { ScreenHeader } from '@/components/screen-header';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { CUSTOMER_LOANS_HREF } from '@/lib/shop-tab-access';
import { useAuth } from '@/providers/auth-provider';
import { useLanguage } from '@/providers/language-provider';

function digitsOnly(value: string): string {
  return value.replace(/\D/g, '');
}

type Step = 'redeeming' | 'pin' | 'failed';

export default function ActivateScreen() {
  const { token: tokenParam } = useLocalSearchParams<{ token?: string | string[] }>();
  const token = Array.isArray(tokenParam) ? tokenParam[0] : tokenParam;
  const router = useRouter();
  const { redeemActivation, setPinForCurrentUser, refreshProfile } = useAuth();
  const { t } = useLanguage();

  const [step, setStep] = useState<Step>('redeeming');
  const [loanId, setLoanId] = useState<string | null>(null);
  const [pin, setPin] = useState('');
  const [pinConfirm, setPinConfirm] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const hasRedeemedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      if (hasRedeemedRef.current) return;
      if (!token || token.trim() === '') {
        if (!cancelled) {
          setFormError(t('auth.activateMissingToken'));
          setStep('failed');
        }
        return;
      }

      setIsSubmitting(true);
      hasRedeemedRef.current = true;
      const result = await redeemActivation(token.trim());
      if (cancelled) return;
      setIsSubmitting(false);

      if (!result.ok) {
        setFormError(
          result.code === 'invalid_token'
            ? t('auth.activateInvalidToken')
            : (result.message ?? t('auth.signInFailed')),
        );
        setStep('failed');
        return;
      }

      setLoanId(result.loanId);
      setStep('pin');
    })();

    return () => {
      cancelled = true;
    };
  }, [token, redeemActivation, t]);

  const handleSetPin = async () => {
    setFormError(null);
    const nextPin = digitsOnly(pin);
    const confirm = digitsOnly(pinConfirm);

    if (nextPin.length !== 6) {
      setFormError(t('auth.invalidPin'));
      return;
    }
    if (nextPin !== confirm) {
      setFormError(t('auth.pinMismatch'));
      return;
    }

    setIsSubmitting(true);
    const { error } = await setPinForCurrentUser(nextPin);
    setIsSubmitting(false);

    if (error) {
      if (error.includes('weak_pin')) {
        setFormError(t('auth.weakPin'));
        return;
      }
      setFormError(error);
      return;
    }

    await refreshProfile();
    // Customer loan detail by public_token is a later phase; list shows the loan.
    void loanId;
    router.replace(CUSTOMER_LOANS_HREF);
  };

  return (
    <ThemedView style={styles.container}>
      <ScreenHeader title={t('auth.activateTitle')} subtitle={t('auth.activateSubtitle')} />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.form}>
        <View style={styles.content}>
          <Card>
            {step === 'redeeming' ? (
              <FormNotice notice={t('auth.activateRedeeming')} error={formError} />
            ) : null}
            {step === 'failed' ? <FormNotice error={formError} /> : null}
            {step === 'pin' ? (
              <>
                <Field
                  label={t('auth.choosePin')}
                  value={pin}
                  onChangeText={(value) => setPin(digitsOnly(value).slice(0, 6))}
                  placeholder={t('auth.pinPlaceholder')}
                  keyboardType="number-pad"
                  maxLength={6}
                  secureTextEntry
                  secureToggle
                  editable={!isSubmitting}
                  testID="activate-pin"
                />
                <Field
                  label={t('auth.confirmPin')}
                  value={pinConfirm}
                  onChangeText={(value) => setPinConfirm(digitsOnly(value).slice(0, 6))}
                  placeholder={t('auth.pinPlaceholder')}
                  keyboardType="number-pad"
                  maxLength={6}
                  secureTextEntry
                  secureToggle
                  editable={!isSubmitting}
                  testID="activate-pin-confirm"
                />
                <FormNotice error={formError} />
                <Button
                  testID="activate-set-pin"
                  label={t('auth.savePinAndContinue')}
                  loading={isSubmitting}
                  requiresNetwork
                  onPress={() => void handleSetPin()}
                />
              </>
            ) : null}
          </Card>
        </View>
      </KeyboardAvoidingView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { flex: 1, justifyContent: 'center', padding: Spacing.four, gap: Spacing.three },
  form: { flex: 1 },
});
