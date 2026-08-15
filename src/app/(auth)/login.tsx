import { useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';

import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { Field } from '@/components/field';
import { FormNotice } from '@/components/form-notice';
import { ScreenHeader } from '@/components/screen-header';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { toE164India } from '@/lib/phone';
import { supabase } from '@/lib/supabase';
import { routeForRole, useAuth } from '@/providers/auth-provider';
import { useLanguage } from '@/providers/language-provider';
import type { Profile, UserRole } from '@/types/database';

export default function LoginScreen() {
  const router = useRouter();
  const { refreshProfile } = useAuth();
  const { t } = useLanguage();

  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [step, setStep] = useState<'phone' | 'otp'>('phone');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [formNotice, setFormNotice] = useState<string | null>(null);

  const handleSendOtp = async () => {
    setFormError(null);
    setFormNotice(null);
    let normalized: string;
    try {
      normalized = toE164India(phone.trim());
    } catch {
      setFormError(t('auth.invalidMobile'));
      return;
    }
    if (normalized.length < 13) {
      setFormError(t('auth.invalidMobile'));
      return;
    }

    setIsSubmitting(true);
    const { error } = await supabase.auth.signInWithOtp({ phone: normalized });
    setIsSubmitting(false);

    if (error) {
      setFormError(error.message);
      return;
    }

    setStep('otp');
    setFormNotice(t('auth.otpSent', { phone: normalized }));
  };

  const handleVerifyOtp = async () => {
    setFormError(null);
    setFormNotice(null);
    let normalized: string;
    try {
      normalized = toE164India(phone.trim());
    } catch {
      setFormError(t('auth.invalidMobile'));
      return;
    }
    if (otp.trim().length < 4) {
      setFormError(t('auth.enterVerificationCode'));
      return;
    }

    setIsSubmitting(true);
    const { data, error } = await supabase.auth.verifyOtp({
      phone: normalized,
      token: otp.trim(),
      type: 'sms',
    });
    setIsSubmitting(false);

    if (error) {
      setFormError(error.message);
      return;
    }

    if (!data.user) {
      setFormError(t('auth.noUserSession'));
      return;
    }

    await supabase
      .from('profiles')
      .update({ phone_number: normalized })
      .eq('id', data.user.id);

    await refreshProfile();

    const { data: profileRow } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', data.user.id)
      .maybeSingle();

    const role = (profileRow as Profile | null)?.role as UserRole | undefined;
    router.replace(routeForRole(role));
  };

  return (
    <ThemedView style={styles.container}>
      <ScreenHeader title={t('auth.title')} subtitle={t('auth.subtitle')} />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.form}>
        <View style={styles.content}>
          <Card>
            <Field
              label={t('auth.mobileNumber')}
              value={phone}
              onChangeText={setPhone}
              placeholder={t('auth.mobilePlaceholder')}
              keyboardType="phone-pad"
              editable={step === 'phone' && !isSubmitting}
              testID="login-phone"
            />

            {step === 'otp' ? (
              <Field
                label={t('auth.verificationCode')}
                value={otp}
                onChangeText={setOtp}
                placeholder={t('auth.otpPlaceholder')}
                keyboardType="number-pad"
                maxLength={6}
                editable={!isSubmitting}
                testID="login-otp"
              />
            ) : null}

            <FormNotice error={formError} notice={formNotice} />

            <Button
              testID={step === 'phone' ? 'login-send-otp' : 'login-verify'}
              label={step === 'phone' ? t('auth.sendOtp') : t('auth.verifyAndSignIn')}
              loading={isSubmitting}
              onPress={() => void (step === 'phone' ? handleSendOtp() : handleVerifyOtp())}
            />

            {step === 'otp' ? (
              <Button
                label={t('auth.changePhoneNumber')}
                variant="secondary"
                disabled={isSubmitting}
                onPress={() => {
                  setStep('phone');
                  setFormError(null);
                  setFormNotice(null);
                }}
              />
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
