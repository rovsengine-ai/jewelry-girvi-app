import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Href } from 'expo-router';
import type { Session } from '@supabase/supabase-js';

import { authMode, type AuthMode } from '@/lib/auth-mode';
import { supabase } from '@/lib/supabase';
import { ADMIN_LOANS_HREF, CUSTOMER_LOANS_HREF } from '@/lib/shop-tab-access';
import { clearLoanReminderNotifications } from '@/services/loanReminderNotifications';
import {
  redeemLoginTokenForSession,
  setCustomerPin,
  signInWithCustomerPin,
  type PinSignInErrorCode,
} from '@/services/customerAuthService';
import type { Profile, UserRole } from '@/types/database';

export type SignInWithPinResult =
  | { ok: true }
  | { ok: false; code: PinSignInErrorCode; message?: string };

export type RedeemActivationResult =
  | { ok: true; loanId: string | null }
  | { ok: false; code: 'invalid_token' | 'server'; message?: string };

interface AuthContextValue {
  session: Session | null;
  profile: Profile | null;
  isLoading: boolean;
  /** otp | pin — from EXPO_PUBLIC_AUTH_MODE (default pin). */
  authMode: AuthMode;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  /** OTP path: request SMS code. Used when authMode === 'otp'. */
  sendOtp: (phoneE164: string) => Promise<{ error: string | null }>;
  /** OTP path: verify SMS code and establish session. */
  verifyOtp: (phoneE164: string, token: string) => Promise<{ error: string | null }>;
  /** PIN path: verify via SQL + Edge session mint. Phone as typed (SQL normalises). */
  signInWithPin: (phone: string, pin: string) => Promise<SignInWithPinResult>;
  /**
   * Counter QR: redeem token + mint session. Caller then collects PIN via
   * setPinForCurrentUser and routes to the loan.
   */
  redeemActivation: (token: string) => Promise<RedeemActivationResult>;
  setPinForCurrentUser: (pin: string) => Promise<{ error: string | null }>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

async function fetchProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle();
  if (error) {
    console.warn('Failed to load profile:', error.message);
    return null;
  }
  return data as Profile | null;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refreshProfile = useCallback(async () => {
    if (!session?.user.id) {
      setProfile(null);
      return;
    }
    const nextProfile = await fetchProfile(session.user.id);
    setProfile(nextProfile);
  }, [session?.user.id]);

  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setSession(data.session);
      setIsLoading(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setIsLoading(false);
    });

    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!session?.user.id) {
      setProfile(null);
      return;
    }
    void refreshProfile();
  }, [session?.user.id, refreshProfile]);

  const signOut = useCallback(async () => {
    await clearLoanReminderNotifications().catch((err) => {
      console.warn(err instanceof Error ? err.message : err);
    });
    // Drop every Realtime channel before clearing the session so the next
    // login cannot receive leftover events from the previous JWT.
    await supabase.removeAllChannels();
    await supabase.auth.signOut();
    setProfile(null);
  }, []);

  const sendOtp = useCallback(async (phoneE164: string) => {
    const { error } = await supabase.auth.signInWithOtp({ phone: phoneE164 });
    return { error: error?.message ?? null };
  }, []);

  const verifyOtp = useCallback(async (phoneE164: string, token: string) => {
    const { data, error } = await supabase.auth.verifyOtp({
      phone: phoneE164,
      token,
      type: 'sms',
    });
    if (error) {
      return { error: error.message };
    }
    if (!data.user) {
      return { error: 'no_user' };
    }

    await supabase.from('profiles').update({ phone_number: phoneE164 }).eq('id', data.user.id);

    return { error: null };
  }, []);

  const signInWithPin = useCallback(async (phone: string, pin: string): Promise<SignInWithPinResult> => {
    const result = await signInWithCustomerPin(phone, pin);
    if (!result.ok) {
      return { ok: false, code: result.code, message: result.message };
    }

    const { error } = await supabase.auth.setSession({
      access_token: result.accessToken,
      refresh_token: result.refreshToken,
    });
    if (error) {
      return { ok: false, code: 'server', message: error.message };
    }

    return { ok: true };
  }, []);

  const redeemActivation = useCallback(async (token: string): Promise<RedeemActivationResult> => {
    const result = await redeemLoginTokenForSession(token);
    if (!result.ok) {
      return { ok: false, code: result.code, message: result.message };
    }

    const { error } = await supabase.auth.setSession({
      access_token: result.accessToken,
      refresh_token: result.refreshToken,
    });
    if (error) {
      return { ok: false, code: 'server', message: error.message };
    }

    return { ok: true, loanId: result.loanId };
  }, []);

  const setPinForCurrentUser = useCallback(async (pin: string) => {
    return setCustomerPin(pin);
  }, []);

  const value = useMemo(
    () => ({
      session,
      profile,
      isLoading,
      authMode,
      signOut,
      refreshProfile,
      sendOtp,
      verifyOtp,
      signInWithPin,
      redeemActivation,
      setPinForCurrentUser,
    }),
    [
      session,
      profile,
      isLoading,
      signOut,
      refreshProfile,
      sendOtp,
      verifyOtp,
      signInWithPin,
      redeemActivation,
      setPinForCurrentUser,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}

export function routeForRole(role: UserRole | undefined): Href {
  if (role === 'owner' || role === 'staff') {
    return ADMIN_LOANS_HREF;
  }
  return CUSTOMER_LOANS_HREF;
}
