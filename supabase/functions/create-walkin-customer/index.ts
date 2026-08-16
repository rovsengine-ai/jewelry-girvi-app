import 'jsr:@supabase/functions-js/edge-runtime.d.ts';

import { createClient } from 'jsr:@supabase/supabase-js@2';

// Solves the walk-in blocker: staff could not write a loan until the customer
// had installed the app and completed OTP signup themselves. admin.createUser
// with phone_confirm: true creates a confirmed account WITHOUT sending an SMS,
// so the counter is never blocked on the customer's handset or on shop signal.
// The customer logs in later with OTP on the same number and finds their loans
// already there, because profiles.id stays equal to auth.users.id.
// Docs: https://supabase.com/docs/reference/javascript/auth-admin-createuser
//
// The service-role key must never reach the client, hence an Edge Function.

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

/**
 * Same algorithm as public.normalize_phone_e164 and toE164India in the app.
 * All three must agree or a customer gets two accounts under one number.
 */
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

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return jsonResponse({ error: 'Missing Authorization header' }, 401);
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey) {
      return jsonResponse({ error: 'Server misconfigured' }, 500);
    }

    // Establish who is calling using their own JWT, under RLS.
    const caller = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const {
      data: { user },
      error: userError,
    } = await caller.auth.getUser();
    if (userError || !user) {
      return jsonResponse({ error: 'Unauthorized' }, 401);
    }

    const { data: profile, error: profileError } = await caller
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .maybeSingle();

    // Account creation is a shop-counter action. Without this gate the endpoint
    // would let any authenticated customer mint accounts for other people.
    if (profileError || !profile || (profile.role !== 'owner' && profile.role !== 'staff')) {
      return jsonResponse({ error: 'Forbidden: shop users only' }, 403);
    }

    const body = (await req.json()) as {
      phone_number?: string;
      full_name?: string;
      address?: string;
      role?: string;
    };

    const phone = normalizePhoneE164(body.phone_number ?? '');
    if (!phone) {
      return jsonResponse(
        {
          error:
            'A valid 10-digit Indian mobile number is required (optionally with a +91 prefix).',
        },
        400,
      );
    }

    const fullName = body.full_name?.trim() || null;
    const address = body.address?.trim() || null;
    const requestedRole = body.role?.trim();
    const customerRole =
      requestedRole === 'merchant' ? 'merchant' : 'retail_customer';

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Never create a second account for a number we already know. The profiles
    // lookup is authoritative because handle_new_user() mirrors every auth user
    // into profiles, and phone_number is UNIQUE there.
    const { data: existing, error: existingError } = await admin
      .from('profiles')
      .select('id, role')
      .eq('phone_number', phone)
      .maybeSingle();

    if (existingError) {
      return jsonResponse({ error: existingError.message }, 500);
    }

    if (existing) {
      const existingRole = existing.role;
      const canRetype =
        existingRole === 'retail_customer' || existingRole === 'merchant';
      if (canRetype && existingRole !== customerRole) {
        const { error: roleError } = await admin
          .from('profiles')
          .update({ role: customerRole })
          .eq('id', existing.id);
        if (roleError) {
          return jsonResponse({ error: roleError.message }, 500);
        }
      }
      return jsonResponse({ customer_id: existing.id, created: false });
    }

    const { data: created, error: createError } = await admin.auth.admin.createUser({
      phone,
      phone_confirm: true,
      user_metadata: {
        role: customerRole,
        full_name: fullName,
        created_by_shop_user: user.id,
      },
    });

    if (createError || !created.user) {
      return jsonResponse(
        { error: createError?.message ?? 'Could not create the customer account.' },
        500,
      );
    }

    // handle_new_user() has already inserted the profile row with the phone and
    // name from metadata. Only the address still needs writing, and only when
    // staff actually captured one.
    if (address) {
      const { error: addressError } = await admin
        .from('profiles')
        .update({ address })
        .eq('id', created.user.id);

      if (addressError) {
        return jsonResponse({ error: addressError.message }, 500);
      }
    }

    return jsonResponse({ customer_id: created.user.id, created: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected error';
    return jsonResponse({ error: message }, 500);
  }
});
