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
        if (typeof foundId === 'string' && (await isProfileLocked(admin, foundId))) {
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
