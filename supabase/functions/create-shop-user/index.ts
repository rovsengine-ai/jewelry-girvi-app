import 'jsr:@supabase/functions-js/edge-runtime.d.ts';

import { createClient } from 'jsr:@supabase/supabase-js@2';

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

function isValidPin(pin: string): boolean {
  return /^\d{6}$/.test(pin);
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

    const { data: callerProfile, error: profileError } = await caller
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .maybeSingle();

    if (profileError || !callerProfile || callerProfile.role !== 'owner') {
      return jsonResponse({ error: 'Forbidden: shop owner only' }, 403);
    }

    const body = (await req.json()) as {
      phone_number?: string;
      full_name?: string;
      role?: string;
      pin?: string;
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
    const requestedRole = body.role?.trim();
    const shopRole = requestedRole === 'owner' ? 'owner' : 'staff';
    const pin = typeof body.pin === 'string' ? body.pin.trim() : '';

    if (!isValidPin(pin)) {
      return jsonResponse({ error: 'PIN must be exactly 6 digits' }, 400);
    }

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: existing, error: existingError } = await admin
      .from('profiles')
      .select('id, role')
      .eq('phone_number', phone)
      .maybeSingle();

    if (existingError) {
      return jsonResponse({ error: existingError.message }, 500);
    }

    if (existing) {
      if (existing.role === 'owner' || existing.role === 'staff') {
        return jsonResponse({ error: 'A shop account already exists for this number.' }, 409);
      }
      return jsonResponse(
        { error: 'This number belongs to a customer account. Use a different mobile number.' },
        409,
      );
    }

    const { data: created, error: createError } = await admin.auth.admin.createUser({
      phone,
      phone_confirm: true,
      user_metadata: {
        role: shopRole,
        full_name: fullName,
        created_by_shop_owner: user.id,
      },
    });

    if (createError || !created.user) {
      return jsonResponse(
        { error: createError?.message ?? 'Could not create the shop account.' },
        500,
      );
    }

    if (fullName) {
      const { error: nameError } = await admin
        .from('profiles')
        .update({ full_name: fullName, role: shopRole })
        .eq('id', created.user.id);

      if (nameError) {
        return jsonResponse({ error: nameError.message }, 500);
      }
    } else {
      const { error: roleError } = await admin
        .from('profiles')
        .update({ role: shopRole })
        .eq('id', created.user.id);

      if (roleError) {
        return jsonResponse({ error: roleError.message }, 500);
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
      return jsonResponse({ error: pinError.message }, 500);
    }

    return jsonResponse({ user_id: created.user.id, role: shopRole, created: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected error';
    return jsonResponse({ error: message }, 500);
  }
});
