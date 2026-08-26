import { supabase } from '@/lib/supabase';

export type PinSignInErrorCode = 'locked' | 'invalid' | 'server';

export type PinSignInResult =
  | { ok: true; accessToken: string; refreshToken: string; profileId: string }
  | { ok: false; code: PinSignInErrorCode; message?: string };

export type ActivateResult =
  | {
      ok: true;
      accessToken: string;
      refreshToken: string;
      profileId: string;
      loanId: string | null;
    }
  | { ok: false; code: 'invalid_token' | 'server'; message?: string };

export type RegisterErrorCode =
  | 'weak_pin'
  | 'already_registered'
  | 'forbidden'
  | 'invalid'
  | 'server';

export type RegisterResult =
  | { ok: true; accessToken: string; refreshToken: string; profileId: string; created: boolean }
  | { ok: false; code: RegisterErrorCode; message?: string };

type EdgePinSuccess = {
  access_token: string;
  refresh_token: string;
  profile_id: string;
};

type EdgeActivateSuccess = EdgePinSuccess & {
  loan_id: string | null;
};

type EdgeRegisterSuccess = EdgePinSuccess & {
  created?: boolean;
};

type EdgeError = {
  error?: string;
  message?: string;
};

/**
 * Verifies PIN in SQL (via Edge) and returns Auth session tokens.
 * Phone is passed as the customer typed it — SQL normalises via
 * normalize_phone_e164 / find_profile_by_phone.
 */
export async function signInWithCustomerPin(
  phone: string,
  pin: string,
): Promise<PinSignInResult> {
  const { data, error } = await supabase.functions.invoke<EdgePinSuccess | EdgeError>(
    'customer-session',
    { body: { action: 'pin', phone, pin } },
  );

  const payload = data ?? null;
  const code = payload && 'error' in payload ? payload.error : undefined;

  if (code === 'locked') {
    return { ok: false, code: 'locked' };
  }
  if (code === 'invalid') {
    return { ok: false, code: 'invalid' };
  }

  if (payload && 'access_token' in payload && payload.access_token && payload.refresh_token) {
    return {
      ok: true,
      accessToken: payload.access_token,
      refreshToken: payload.refresh_token,
      profileId: payload.profile_id,
    };
  }

  if (error) {
    return { ok: false, code: 'server', message: error.message };
  }

  return {
    ok: false,
    code: 'server',
    message: payload && 'message' in payload ? payload.message : undefined,
  };
}

/**
 * Redeems a counter QR token (SQL) and returns Auth session tokens so the
 * customer can call set_customer_pin as auth.uid().
 */
export async function redeemLoginTokenForSession(token: string): Promise<ActivateResult> {
  const { data, error } = await supabase.functions.invoke<EdgeActivateSuccess | EdgeError>(
    'customer-session',
    { body: { action: 'activate', token } },
  );

  const payload = data ?? null;

  if (payload && 'access_token' in payload && payload.access_token && payload.refresh_token) {
    return {
      ok: true,
      accessToken: payload.access_token,
      refreshToken: payload.refresh_token,
      profileId: payload.profile_id,
      loanId: payload.loan_id ?? null,
    };
  }

  if (payload && 'error' in payload && payload.error === 'invalid_token') {
    return { ok: false, code: 'invalid_token', message: payload.message };
  }

  if (error) {
    return { ok: false, code: 'server', message: error.message };
  }

  return {
    ok: false,
    code: 'invalid_token',
    message: payload && 'message' in payload ? payload.message : undefined,
  };
}

export async function setCustomerPin(pin: string): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('set_customer_pin', { p_pin: pin });
  return { error: error?.message ?? null };
}

/**
 * Self-service customer signup: phone + PIN. Creates auth user when new, or
 * sets PIN when the shop already created a walk-in account without PIN.
 */
export async function registerCustomerWithPin(
  phone: string,
  pin: string,
): Promise<RegisterResult> {
  const { data, error } = await supabase.functions.invoke<EdgeRegisterSuccess | EdgeError>(
    'customer-session',
    { body: { action: 'register', phone, pin } },
  );

  const payload = data ?? null;
  const code = payload && 'error' in payload ? payload.error : undefined;

  if (code === 'weak_pin') {
    return { ok: false, code: 'weak_pin' };
  }
  if (code === 'already_registered') {
    const message =
      payload && 'error' in payload && 'message' in payload
        ? (payload.message as string | undefined)
        : undefined;
    return { ok: false, code: 'already_registered', message };
  }
  if (code === 'forbidden') {
    const message =
      payload && 'error' in payload && 'message' in payload
        ? (payload.message as string | undefined)
        : undefined;
    return { ok: false, code: 'forbidden', message };
  }
  if (code === 'invalid') {
    const message =
      payload && 'error' in payload && 'message' in payload
        ? (payload.message as string | undefined)
        : undefined;
    return { ok: false, code: 'invalid', message };
  }

  if (payload && 'access_token' in payload && payload.access_token && payload.refresh_token) {
    return {
      ok: true,
      accessToken: payload.access_token,
      refreshToken: payload.refresh_token,
      profileId: payload.profile_id,
      created: Boolean(payload.created),
    };
  }

  if (error) {
    return { ok: false, code: 'server', message: error.message };
  }

  return {
    ok: false,
    code: 'server',
    message: payload && 'message' in payload ? payload.message : undefined,
  };
}

/** Shop-only. Clears customer PIN so they can create a new one from the app. */
export async function resetCustomerPin(
  profileId: string,
): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('admin_reset_customer_pin', {
    p_profile_id: profileId,
  });
  return { error: error?.message ?? null };
}

/** Shop-only. Returns the opaque token string for the activation QR URL. */
export async function issueLoginToken(
  profileId: string,
  loanId: string,
): Promise<{ token: string | null; error: string | null }> {
  const { data, error } = await supabase.rpc('issue_login_token', {
    p_profile_id: profileId,
    p_loan_id: loanId,
  });

  if (error) {
    return { token: null, error: error.message };
  }

  return { token: typeof data === 'string' ? data : null, error: null };
}

/** Activation deep link path + query. https://docs.expo.dev/versions/v57.0.0/sdk/linking/ */
export const LOGIN_TOKEN_TTL_MS = 5 * 60 * 1000;
