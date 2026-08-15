import { useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';

import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { Field } from '@/components/field';
import { FormNotice } from '@/components/form-notice';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing, TypeScale } from '@/constants/theme';
import { toE164India } from '@/lib/phone';
import { supabase } from '@/lib/supabase';
import { routeForRole, useAuth } from '@/providers/auth-provider';
import type { Profile, UserRole } from '@/types/database';

export default function LoginScreen() {
  const router = useRouter();
  const { refreshProfile } = useAuth();

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
      setFormError('Enter a valid 10-digit mobile number.');
      return;
    }
    if (normalized.length < 13) {
      setFormError('Enter a valid 10-digit mobile number.');
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
    setFormNotice(`Verification code sent to ${normalized}`);
  };

  const handleVerifyOtp = async () => {
    setFormError(null);
    setFormNotice(null);
    let normalized: string;
    try {
      normalized = toE164India(phone.trim());
    } catch {
      setFormError('Enter a valid 10-digit mobile number.');
      return;
    }
    if (otp.trim().length < 4) {
      setFormError('Enter the verification code from SMS.');
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
      setFormError('No user session returned.');
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
      <SafeAreaView style={styles.content}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.form}>
          <ThemedText style={TypeScale.display}>Girvi Shop Login</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            Sign in with your mobile number to view receipts or manage loans.
          </ThemedText>

          <Card>
            <Field
              label="Mobile number"
              value={phone}
              onChangeText={setPhone}
              placeholder="10-digit mobile number"
              keyboardType="phone-pad"
              editable={step === 'phone' && !isSubmitting}
            />

            {step === 'otp' ? (
              <Field
                label="Verification code"
                value={otp}
                onChangeText={setOtp}
                placeholder="Enter OTP"
                keyboardType="number-pad"
                maxLength={6}
                editable={!isSubmitting}
              />
            ) : null}

            <FormNotice error={formError} notice={formNotice} />

            <Button
              label={step === 'phone' ? 'Send OTP' : 'Verify & Sign In'}
              loading={isSubmitting}
              onPress={() => void (step === 'phone' ? handleSendOtp() : handleVerifyOtp())}
            />

            {step === 'otp' ? (
              <Button
                label="Change phone number"
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
        </KeyboardAvoidingView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { flex: 1, justifyContent: 'center', padding: Spacing.four },
  form: { gap: Spacing.three },
});
