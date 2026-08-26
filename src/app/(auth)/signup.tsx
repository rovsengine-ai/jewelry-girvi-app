/**
 * Customer self-signup: mobile number + PIN (no SMS).
 * Router: https://docs.expo.dev/versions/v57.0.0/sdk/router/
 */
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
import { CUSTOMER_LOANS_HREF } from '@/lib/shop-tab-access';
import { routeForRole, useAuth } from '@/providers/auth-provider';
import { useLanguage } from '@/providers/language-provider';
import type { Profile, UserRole } from '@/types/database';
import { supabase } from '@/lib/supabase';

function digitsOnly(value: string): string {
  return value.replace(/\D/g, '');
}

export default function SignupScreen() {
  const router = useRouter();
  const { registerWithPin, refreshProfile } = useAuth();
  const { t } = useLanguage();

  const [phone, setPhone] = useState('');
  const [pin, setPin] = useState('');
  const [pinConfirm, setPinConfirm] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const phoneDigits = digitsOnly(phone);
  let displayE164: string | null = null;
  try {
    if (phoneDigits.length === 10) {
      displayE164 = toE164India(phoneDigits);
    }
  } catch {
    displayE164 = null;
  }

  const handleSignup = async () => {
    setFormError(null);

    if (phoneDigits.length !== 10) {
      setFormError(t('auth.invalidMobile'));
      return;
    }

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
    const result = await registerWithPin(phoneDigits, nextPin);
    setIsSubmitting(false);

    if (!result.ok) {
      if (result.code === 'weak_pin') {
        setFormError(t('auth.weakPin'));
        return;
      }
      if (result.code === 'already_registered') {
        setFormError(t('auth.alreadyRegistered'));
        return;
      }
      if (result.code === 'forbidden') {
        setFormError(t('auth.shopAccountUseStaffLogin'));
        return;
      }
      setFormError(result.message ?? t('auth.signUpFailed'));
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
    if (role === 'owner' || role === 'staff') {
      router.replace(routeForRole(role));
      return;
    }

    router.replace(CUSTOMER_LOANS_HREF);
  };

  return (
    <ThemedView style={styles.container}>
      <ScreenHeader title={t('auth.signUpTitle')} subtitle={t('auth.signUpSubtitle')} />
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
              testID="signup-phone"
            />
            {displayE164 ? (
              <ThemedText type="small">{t('auth.phoneDisplay', { phone: displayE164 })}</ThemedText>
            ) : null}
            <Field
              label={t('auth.choosePin')}
              value={pin}
              onChangeText={(value) => setPin(digitsOnly(value).slice(0, 6))}
              placeholder={t('auth.pinPlaceholder')}
              keyboardType="number-pad"
              maxLength={6}
              secureTextEntry
              editable={!isSubmitting}
              testID="signup-pin"
            />
            <Field
              label={t('auth.confirmPin')}
              value={pinConfirm}
              onChangeText={(value) => setPinConfirm(digitsOnly(value).slice(0, 6))}
              placeholder={t('auth.pinPlaceholder')}
              keyboardType="number-pad"
              maxLength={6}
              secureTextEntry
              editable={!isSubmitting}
              testID="signup-pin-confirm"
            />
            <FormNotice error={formError} />
            <Button
              testID="signup-submit"
              label={t('auth.createAccount')}
              loading={isSubmitting}
              requiresNetwork
              onPress={() => void handleSignup()}
            />
            <Link href={'/(auth)/login' as Href} asChild>
              <ThemedText type="small" style={styles.signInLink}>
                {t('auth.alreadyHaveAccount')}
              </ThemedText>
            </Link>
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
  signInLink: { textAlign: 'center', marginTop: Spacing.two },
});
