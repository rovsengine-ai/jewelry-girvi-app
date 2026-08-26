import { useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, View } from 'react-native';
import { Link, useRouter, type Href } from 'expo-router';

import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { Field } from '@/components/field';
import { FormNotice } from '@/components/form-notice';
import { ScreenHeader } from '@/components/screen-header';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { toE164India } from '@/lib/phone';
import { routeForRole, useAuth } from '@/providers/auth-provider';
import { useLanguage } from '@/providers/language-provider';
import type { Profile, UserRole } from '@/types/database';
import { supabase } from '@/lib/supabase';

function digitsOnly(value: string): string {
  return value.replace(/\D/g, '');
}

export default function LoginScreen() {
  const router = useRouter();
  const { authMode, refreshProfile, sendOtp, verifyOtp, signInWithPin, signOut } = useAuth();
  const { t } = useLanguage();

  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [pin, setPin] = useState('');
  const [step, setStep] = useState<'phone' | 'otp'>('phone');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [formNotice, setFormNotice] = useState<string | null>(null);

  const phoneDigits = digitsOnly(phone);
  let displayE164: string | null = null;
  try {
    if (phoneDigits.length === 10) {
      displayE164 = toE164India(phoneDigits);
    }
  } catch {
    displayE164 = null;
  }

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
    const { error } = await sendOtp(normalized);
    setIsSubmitting(false);

    if (error) {
      setFormError(error);
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
    const { error } = await verifyOtp(normalized, otp.trim());
    setIsSubmitting(false);

    if (error === 'no_user') {
      setFormError(t('auth.noUserSession'));
      return;
    }
    if (error) {
      setFormError(error);
      return;
    }

    await refreshProfile();

    const { data: profileRow } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', (await supabase.auth.getUser()).data.user?.id ?? '')
      .maybeSingle();

    const role = (profileRow as Profile | null)?.role as UserRole | undefined;
    if (Platform.OS === 'web' && (role === 'owner' || role === 'staff')) {
      await signOut();
      setFormError(t('auth.webShopUseMobile'));
      return;
    }
    router.replace(routeForRole(role));
  };

  const handlePinSignIn = async () => {
    setFormError(null);
    setFormNotice(null);

    if (phoneDigits.length !== 10) {
      setFormError(t('auth.invalidMobile'));
      return;
    }
    if (digitsOnly(pin).length !== 6) {
      setFormError(t('auth.invalidPin'));
      return;
    }

    setIsSubmitting(true);
    // Pass digits as typed — SQL normalises. toE164India is display-only above.
    const result = await signInWithPin(phoneDigits, digitsOnly(pin));
    setIsSubmitting(false);

    if (!result.ok) {
      if (result.code === 'locked') {
        setFormError(t('auth.accountLocked'));
        return;
      }
      if (result.code === 'invalid') {
        setFormError(t('auth.invalidPinOrPhone'));
        return;
      }
      setFormError(result.message ?? t('auth.signInFailed'));
      return;
    }

    await refreshProfile();

    const { data: userData } = await supabase.auth.getUser();
    const userId = userData.user?.id;
    if (!userId) {
      setFormError(t('auth.noUserSession'));
      return;
    }

    const { data: profileRow } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle();

    const role = (profileRow as Profile | null)?.role as UserRole | undefined;
    if (Platform.OS === 'web' && (role === 'owner' || role === 'staff')) {
      await signOut();
      setFormError(t('auth.webShopUseMobile'));
      return;
    }
    router.replace(routeForRole(role));
  };

  if (authMode === 'pin') {
    return (
      <ThemedView style={styles.container}>
        <ScreenHeader title={t('auth.title')} subtitle={t('auth.pinSubtitle')} />
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.form}>
          <View style={styles.content}>
            <Card>
              <Field
                label={t('auth.mobileNumber')}
                value={phone}
                onChangeText={(value) => setPhone(digitsOnly(value).slice(0, 10))}
                placeholder={t('auth.mobilePlaceholder')}
                keyboardType="phone-pad"
                editable={!isSubmitting}
                testID="login-phone"
              />
              {displayE164 ? (
                <ThemedText type="small">{t('auth.phoneDisplay', { phone: displayE164 })}</ThemedText>
              ) : null}
              <Field
                label={t('auth.pin')}
                value={pin}
                onChangeText={(value) => setPin(digitsOnly(value).slice(0, 6))}
                placeholder={t('auth.pinPlaceholder')}
                keyboardType="number-pad"
                maxLength={6}
                secureTextEntry
                editable={!isSubmitting}
                testID="login-pin"
              />
              <FormNotice error={formError} notice={formNotice} />
              <Button
                testID="login-pin-submit"
                label={t('auth.signInWithPin')}
                loading={isSubmitting}
                requiresNetwork
                onPress={() => void handlePinSignIn()}
              />
              <Link href={'/(auth)/signup' as Href} asChild>
                <ThemedText type="small" style={styles.signUpLink}>
                  {t('auth.createAccountLink')}
                </ThemedText>
              </Link>
            </Card>
          </View>
        </KeyboardAvoidingView>
      </ThemedView>
    );
  }

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
              requiresNetwork
              onPress={() => void (step === 'phone' ? handleSendOtp() : handleVerifyOtp())}
            />
            <Link href={'/(auth)/signup' as Href} asChild>
              <ThemedText type="small" style={styles.signUpLink}>
                {t('auth.createAccountLink')}
              </ThemedText>
            </Link>

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
  signUpLink: { textAlign: 'center', marginTop: Spacing.two },
});
