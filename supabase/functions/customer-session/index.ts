import 'jsr:@supabase/functions-js/edge-runtime.d.ts';

import { createClient, type User } from 'jsr:@supabase/supabase-js@2';

/**
 * Mints a Supabase Auth session after SQL PIN verify or login-token redeem.
 * verify_customer_pin / redeem_login_token do not create JWTs; Auth admin
 * APIs must stay off the client (service_role). Pattern matches
 * create-walkin-customer.
 *
 * Docs: https://supabase.com/docs/reference/javascript/auth-admin-generatelink
 * Docs: https://supabase.com/docs/guides/auth/auth-email-passwordless
 */

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function pinLocalEmail(userId: string): string {
  return `${userId.replace(/-/g, '')}@pin.local`;
}

/** Same rules as create-walkin-customer and public.normalize_phone_e164. */
function normalizePhoneE164(input: string): string | null {
  const digits = input.replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('91')) {
    return `+${digits}`;
  }
  if (digits.length === 10) {
    return `+91${digits}`;
  }
  return null;
}

async function ensureEmailForMagicLink(
  admin: ReturnType<typeof createClient>,
  user: User,
): Promise<string> {
  if (user.email && user.email.length > 0) {
    return user.email;
  }

  const email = pinLocalEmail(user.id);
  const { error } = await admin.auth.admin.updateUserById(user.id, {
    email,
    email_confirm: true,
  });
  if (error) {
    throw new Error(error.message);
  }
  return email;
}

async function mintSessionForProfile(
  admin: ReturnType<typeof createClient>,
  profileId: string,
): Promise<{ access_token: string; refresh_token: string }> {
  const { data: userData, error: userError } = await admin.auth.admin.getUserById(profileId);
  if (userError || !userData.user) {
    throw new Error(userError?.message ?? 'User not found');
  }

  const email = await ensureEmailForMagicLink(admin, userData.user);

  const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email,
  });
  if (linkError || !linkData.properties?.hashed_token) {
    throw new Error(linkError?.message ?? 'Could not generate session link');
  }

  const { data: sessionData, error: verifyError } = await admin.auth.verifyOtp({
    token_hash: linkData.properties.hashed_token,
    type: 'email',
  });
  if (verifyError || !sessionData.session) {
    throw new Error(verifyError?.message ?? 'Could not create session');
  }

  return {
    access_token: sessionData.session.access_token,
    refresh_token: sessionData.session.refresh_token,
  };
}

async function isProfileLocked(
  admin: ReturnType<typeof createClient>,
  profileId: string,
): Promise<boolean> {
  const { data, error } = await admin
    .from('customer_credentials')
    .select('locked_until')
    .eq('profile_id', profileId)
    .maybeSingle();

  if (error || !data?.locked_until) {
    return false;
  }

  return new Date(data.locked_until as string).getTime() > Date.now();
}

async function isPhoneLocked(
  admin: ReturnType<typeof createClient>,
  phone: string,
): Promise<boolean> {
  const normalized = normalizePhoneE164(phone);
  if (!normalized) return false;
  const nowIso = new Date().toISOString();
  const { data, error } = await admin
    .from('customer_credentials')
    .select('locked_until, profiles!inner(phone_number)')
    .eq('profiles.phone_number', normalized)
    .gt('locked_until', nowIso)
    .limit(1);
  if (error) return false;
  return Boolean(data && data.length > 0);
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !serviceRoleKey) {
      return jsonResponse({ error: 'Server misconfigured' }, 500);
    }

    const admin = createClient(supabaseUrl, serviceRoleKey);

    const body = (await req.json()) as {
      action?: string;
      phone?: string;
      pin?: string;
      token?: string;
    };

    if (body.action === 'pin') {
      const phone = typeof body.phone === 'string' ? body.phone.trim() : '';
      const pin = typeof body.pin === 'string' ? body.pin.trim() : '';
      if (!phone || !pin) {
        return jsonResponse({ error: 'invalid', message: 'Phone and PIN are required' }, 400);
      }

      const { data: rows, error: verifyError } = await admin.rpc('verify_customer_pin', {
        p_phone: phone,
        p_pin: pin,
      });

      if (verifyError) {
        return jsonResponse({ error: 'invalid', message: verifyError.message }, 400);
      }

      const row = Array.isArray(rows) ? rows[0] : rows;
      const ok = Boolean(row && typeof row === 'object' && 'ok' in row && row.ok);
      const profileId =
        row && typeof row === 'object' && 'profile_id' in row
          ? (row.profile_id as string | null)
          : null;

      if (!ok || !profileId) {
        const { data: foundId } = await admin.rpc('find_profile_by_phone', { p_phone: phone });
        const isLocked =
          (typeof foundId === 'string' && (await isProfileLocked(admin, foundId))) ||
          (await isPhoneLocked(admin, phone));
        if (isLocked) {
          return jsonResponse({ error: 'locked' }, 403);
        }
        return jsonResponse({ error: 'invalid' }, 401);
      }

      const session = await mintSessionForProfile(admin, profileId);
      return jsonResponse({
        access_token: session.access_token,
        refresh_token: session.refresh_token,
        profile_id: profileId,
      });
    }

    if (body.action === 'register') {
      const phoneRaw = typeof body.phone === 'string' ? body.phone.trim() : '';
      const pin = typeof body.pin === 'string' ? body.pin.trim() : '';
      const phone = normalizePhoneE164(phoneRaw);

      if (!phone || !pin) {
        return jsonResponse({ error: 'invalid', message: 'Phone and PIN are required' }, 400);
      }

      const { data: existingRows, error: existingError } = await admin
        .from('profiles')
        .select('id, role')
        .eq('phone_number', phone)
        .returns<Array<{ id: string; role: string }>>();

      if (existingError) {
        return jsonResponse({ error: 'server', message: existingError.message }, 500);
      }

      const existing = existingRows ?? [];
      const customerProfile = existing.find(
        (row) => row.role === 'retail_customer' || row.role === 'merchant',
      );
      const hasShopProfile = existing.some((row) => row.role === 'owner' || row.role === 'staff');

      if (customerProfile) {
        const { data: cred, error: credError } = await admin
          .from('customer_credentials')
          .select('profile_id')
          .eq('profile_id', customerProfile.id)
          .maybeSingle();

        if (credError) {
          return jsonResponse({ error: 'server', message: credError.message }, 500);
        }

        if (cred) {
          return jsonResponse(
            { error: 'already_registered', message: 'Account already exists. Sign in or visit the shop to reset PIN.' },
            409,
          );
        }

        const { error: pinError } = await admin.rpc('set_customer_pin_for_profile', {
          p_profile_id: customerProfile.id,
          p_pin: pin,
        });

        if (pinError) {
          if (pinError.message.includes('weak_pin')) {
            return jsonResponse({ error: 'weak_pin' }, 400);
          }
          return jsonResponse({ error: 'server', message: pinError.message }, 500);
        }

        const session = await mintSessionForProfile(admin, customerProfile.id);
        return jsonResponse({
          access_token: session.access_token,
          refresh_token: session.refresh_token,
          profile_id: customerProfile.id,
          created: false,
        });
      }

      const { data: created, error: createError } = hasShopProfile
        ? await admin.auth.admin.createUser({
            email: `customer-${Date.now()}-${crypto.randomUUID().slice(0, 8)}@pin.local`,
            email_confirm: true,
            user_metadata: { role: 'retail_customer' },
          })
        : await admin.auth.admin.createUser({
            phone,
            phone_confirm: true,
            user_metadata: { role: 'retail_customer' },
          });

      if (createError || !created.user) {
        return jsonResponse(
          { error: 'server', message: createError?.message ?? 'Could not create account' },
          500,
        );
      }

      if (hasShopProfile) {
        const { error: profilePatchError } = await admin
          .from('profiles')
          .update({ role: 'retail_customer', phone_number: phone })
          .eq('id', created.user.id);
        if (profilePatchError) {
          return jsonResponse({ error: 'server', message: profilePatchError.message }, 500);
        }
      }

      const { error: pinError } = await admin.rpc('set_customer_pin_for_profile', {
        p_profile_id: created.user.id,
        p_pin: pin,
      });

      if (pinError) {
        if (pinError.message.includes('weak_pin')) {
          return jsonResponse({ error: 'weak_pin' }, 400);
        }
        return jsonResponse({ error: 'server', message: pinError.message }, 500);
      }

      const session = await mintSessionForProfile(admin, created.user.id);
      return jsonResponse({
        access_token: session.access_token,
        refresh_token: session.refresh_token,
        profile_id: created.user.id,
        created: true,
      });
    }

    if (body.action === 'activate') {
      const token = typeof body.token === 'string' ? body.token.trim() : '';
      if (!token) {
        return jsonResponse({ error: 'invalid_token', message: 'Token is required' }, 400);
      }

      const { data: rows, error: redeemError } = await admin.rpc('redeem_login_token', {
        p_token: token,
      });

      if (redeemError) {
        return jsonResponse({ error: 'invalid_token' }, 400);
      }

      const row = Array.isArray(rows) ? rows[0] : rows;
      const profileId =
        row && typeof row === 'object' && 'profile_id' in row
          ? (row.profile_id as string | null)
          : null;
      const loanId =
        row && typeof row === 'object' && 'loan_id' in row
          ? (row.loan_id as string | null)
          : null;

      if (!profileId) {
        return jsonResponse({ error: 'invalid_token' }, 400);
      }

      const session = await mintSessionForProfile(admin, profileId);
      return jsonResponse({
        access_token: session.access_token,
        refresh_token: session.refresh_token,
        profile_id: profileId,
        loan_id: loanId,
      });
    }

    return jsonResponse({ error: 'Unknown action' }, 400);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unexpected error';
    return jsonResponse({ error: 'server', message }, 500);
  }
});
