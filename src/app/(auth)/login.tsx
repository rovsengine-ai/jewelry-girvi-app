import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { toE164India } from '@/lib/phone';
import { supabase } from '@/lib/supabase';
import { routeForRole, useAuth } from '@/providers/auth-provider';
import type { Profile, UserRole } from '@/types/database';

export default function LoginScreen() {
  const colors = useTheme();
  const router = useRouter();
  const { refreshProfile } = useAuth();

  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [step, setStep] = useState<'phone' | 'otp'>('phone');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSendOtp = async () => {
    let normalized: string;
    try {
      normalized = toE164India(phone.trim());
    } catch {
      Alert.alert('Invalid phone', 'Enter a valid 10-digit mobile number.');
      return;
    }
    if (normalized.length < 13) {
      Alert.alert('Invalid phone', 'Enter a valid 10-digit mobile number.');
      return;
    }

    setIsSubmitting(true);
    const { error } = await supabase.auth.signInWithOtp({ phone: normalized });
    setIsSubmitting(false);

    if (error) {
      Alert.alert('OTP failed', error.message);
      return;
    }

    setStep('otp');
    Alert.alert('OTP sent', `Verification code sent to ${normalized}`);
  };

  const handleVerifyOtp = async () => {
    let normalized: string;
    try {
      normalized = toE164India(phone.trim());
    } catch {
      Alert.alert('Invalid phone', 'Enter a valid 10-digit mobile number.');
      return;
    }
    if (otp.trim().length < 4) {
      Alert.alert('Invalid OTP', 'Enter the verification code from SMS.');
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
      Alert.alert('Verification failed', error.message);
      return;
    }

    if (!data.user) {
      Alert.alert('Verification failed', 'No user session returned.');
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
          <ThemedText type="title">Girvi Shop Login</ThemedText>
          <ThemedText style={styles.subtitle}>
            Sign in with your mobile number to view receipts or manage loans.
          </ThemedText>

          <TextInput
            value={phone}
            onChangeText={setPhone}
            placeholder="10-digit mobile number"
            placeholderTextColor={colors.textSecondary}
            keyboardType="phone-pad"
            editable={step === 'phone' && !isSubmitting}
            style={[styles.input, { borderColor: colors.backgroundSelected, color: colors.text }]}
          />

          {step === 'otp' ? (
            <TextInput
              value={otp}
              onChangeText={setOtp}
              placeholder="Enter OTP"
              placeholderTextColor={colors.textSecondary}
              keyboardType="number-pad"
              maxLength={6}
              editable={!isSubmitting}
              style={[styles.input, { borderColor: colors.backgroundSelected, color: colors.text }]}
            />
          ) : null}

          <Pressable
            style={[styles.button, { backgroundColor: colors.backgroundSelected }]}
            onPress={step === 'phone' ? handleSendOtp : handleVerifyOtp}
            disabled={isSubmitting}>
            {isSubmitting ? (
              <ActivityIndicator />
            ) : (
              <ThemedText type="smallBold">{step === 'phone' ? 'Send OTP' : 'Verify & Sign In'}</ThemedText>
            )}
          </Pressable>

          {step === 'otp' ? (
            <Pressable onPress={() => setStep('phone')} disabled={isSubmitting}>
              <ThemedText type="small" style={styles.link}>
                Change phone number
              </ThemedText>
            </Pressable>
          ) : null}
        </KeyboardAvoidingView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { flex: 1, justifyContent: 'center', padding: Spacing.four },
  form: { gap: Spacing.three },
  subtitle: { opacity: 0.8 },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    fontSize: 16,
  },
  button: {
    borderRadius: 12,
    paddingVertical: Spacing.three,
    alignItems: 'center',
  },
  link: { textAlign: 'center', opacity: 0.7 },
});
