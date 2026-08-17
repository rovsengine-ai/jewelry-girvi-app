-- Local CLI seed only. Never apply this file to a hosted project.
--
-- This script runs as the postgres role on `supabase db reset` (see
-- [db.seed] in config.toml). Postgres bypasses RLS; we do not weaken any
-- policy to make seeding easier. create_loan is SECURITY INVOKER and
-- checks is_shop_user() via auth.uid(), so we set request.jwt.claims to
-- the seeded owner for those RPC calls only.

-- Stable ids so re-running seed / reset stays idempotent.
-- 00000000-0000-4000-8000-00000000000{1,2,3}

DO $$
DECLARE
  v_owner_id uuid := '00000000-0000-4000-8000-000000000001';
  v_staff_id uuid := '00000000-0000-4000-8000-000000000002';
  v_cust_id uuid := '00000000-0000-4000-8000-000000000003';
  v_owner_phone text := public.normalize_phone_e164('9000000001');
  v_staff_phone text := public.normalize_phone_e164('9000000002');
  v_cust_phone text := public.normalize_phone_e164('9000000003');
  -- GoTrue stores and looks up phones without '+'; profiles keep E.164 with '+'.
  v_owner_auth_phone text := ltrim(v_owner_phone, '+');
  v_staff_auth_phone text := ltrim(v_staff_phone, '+');
  v_cust_auth_phone text := ltrim(v_cust_phone, '+');
  v_today date := (timezone('Asia/Kolkata', now()))::date;
  v_overdue_on date := v_today - 200;
  v_active_id uuid;
  v_overdue_id uuid;
BEGIN
  -- ---------------------------------------------------------------------------
  -- auth.users + identities (phone confirmed). Profiles are created by
  -- handle_new_user; we then set role / name / canonical phone.
  -- ---------------------------------------------------------------------------
  INSERT INTO auth.users (
    instance_id,
    id,
    aud,
    role,
    encrypted_password,
    email_confirmed_at,
    confirmation_token,
    recovery_token,
    email_change_token_new,
    email_change,
    email_change_token_current,
    phone_change,
    phone_change_token,
    reauthentication_token,
    raw_app_meta_data,
    raw_user_meta_data,
    created_at,
    updated_at,
    phone,
    phone_confirmed_at,
    is_sso_user,
    is_anonymous
  )
  VALUES
    (
      '00000000-0000-0000-0000-000000000000',
      v_owner_id,
      'authenticated',
      'authenticated',
      extensions.crypt('local-seed-unused', extensions.gen_salt('bf')),
      NULL,
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '{"provider":"phone","providers":["phone"]}'::jsonb,
      jsonb_build_object('role', 'owner', 'full_name', 'Test Owner'),
      timezone('utc', now()),
      timezone('utc', now()),
      v_owner_auth_phone,
      timezone('utc', now()),
      false,
      false
    ),
    (
      '00000000-0000-0000-0000-000000000000',
      v_staff_id,
      'authenticated',
      'authenticated',
      extensions.crypt('local-seed-unused', extensions.gen_salt('bf')),
      NULL,
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '{"provider":"phone","providers":["phone"]}'::jsonb,
      jsonb_build_object('role', 'staff', 'full_name', 'Test Staff'),
      timezone('utc', now()),
      timezone('utc', now()),
      v_staff_auth_phone,
      timezone('utc', now()),
      false,
      false
    ),
    (
      '00000000-0000-0000-0000-000000000000',
      v_cust_id,
      'authenticated',
      'authenticated',
      extensions.crypt('local-seed-unused', extensions.gen_salt('bf')),
      NULL,
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '{"provider":"phone","providers":["phone"]}'::jsonb,
      jsonb_build_object('role', 'retail_customer', 'full_name', 'Test Customer'),
      timezone('utc', now()),
      timezone('utc', now()),
      v_cust_auth_phone,
      timezone('utc', now()),
      false,
      false
    )
  ON CONFLICT (id) DO UPDATE SET
    phone = EXCLUDED.phone,
    phone_confirmed_at = COALESCE(auth.users.phone_confirmed_at, EXCLUDED.phone_confirmed_at),
    raw_user_meta_data = EXCLUDED.raw_user_meta_data,
    raw_app_meta_data = EXCLUDED.raw_app_meta_data,
    updated_at = timezone('utc', now());

  INSERT INTO auth.identities (
    id,
    user_id,
    identity_data,
    provider,
    provider_id,
    last_sign_in_at,
    created_at,
    updated_at
  )
  VALUES
    (
      v_owner_id,
      v_owner_id,
      jsonb_build_object('sub', v_owner_id::text, 'phone', v_owner_auth_phone),
      'phone',
      v_owner_auth_phone,
      timezone('utc', now()),
      timezone('utc', now()),
      timezone('utc', now())
    ),
    (
      v_staff_id,
      v_staff_id,
      jsonb_build_object('sub', v_staff_id::text, 'phone', v_staff_auth_phone),
      'phone',
      v_staff_auth_phone,
      timezone('utc', now()),
      timezone('utc', now()),
      timezone('utc', now())
    ),
    (
      v_cust_id,
      v_cust_id,
      jsonb_build_object('sub', v_cust_id::text, 'phone', v_cust_auth_phone),
      'phone',
      v_cust_auth_phone,
      timezone('utc', now()),
      timezone('utc', now()),
      timezone('utc', now())
    )
  ON CONFLICT (provider, provider_id) DO NOTHING;

  -- Trigger already inserted profiles; pin role/name/phone via normalize_phone_e164.
  UPDATE public.profiles
  SET
    role = 'owner',
    full_name = 'Test Owner',
    phone_number = v_owner_phone
  WHERE id = v_owner_id;

  UPDATE public.profiles
  SET
    role = 'staff',
    full_name = 'Test Staff',
    phone_number = v_staff_phone
  WHERE id = v_staff_id;

  UPDATE public.profiles
  SET
    role = 'retail_customer',
    full_name = 'Test Customer',
    phone_number = v_cust_phone
  WHERE id = v_cust_id;

  INSERT INTO public.shop_defaults (id)
  VALUES (1)
  ON CONFLICT (id) DO NOTHING;

  -- Impersonate the owner so create_loan's is_shop_user() check passes.
  -- Still running as postgres (RLS bypassed); jwt claims are only for auth.uid().
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object(
      'sub', v_owner_id::text,
      'role', 'authenticated',
      'aud', 'authenticated'
    )::text,
    true
  );
  PERFORM set_config('request.jwt.claim.sub', v_owner_id::text, true);

  IF NOT EXISTS (
    SELECT 1 FROM public.loans WHERE serial_number = 'SEED-ACTIVE'
  ) THEN
    SELECT loan_id INTO v_active_id
    FROM public.create_loan(
      v_cust_id,
      'SEED-ACTIVE',
      NULL,
      5000000, -- 50,000 INR in paise
      300,
      v_today,
      'retail'::public.interest_model,
      NULL,
      '[
        {"metal":"gold","ornament_type":"Gold chain","gross_weight_mg":10500,"net_weight_mg":10000,"stone_deduction_mg":500,"purity_karat":22,"quantity":1},
        {"metal":"gold","ornament_type":"Gold ring","gross_weight_mg":4000,"net_weight_mg":4000,"purity_karat":22,"quantity":1}
      ]'::jsonb
    );
  ELSE
    SELECT id INTO v_active_id
    FROM public.loans
    WHERE serial_number = 'SEED-ACTIVE';
  END IF;

  -- Overdue: due is disbursed_on + simple_period_days (180). Pass 200 days
  -- ago into create_loan so SQL overdue math (loans_overdue_as_of) fires
  -- without a later date UPDATE.
  IF NOT EXISTS (
    SELECT 1 FROM public.loans WHERE serial_number = 'SEED-OVERDUE'
  ) THEN
    SELECT loan_id INTO v_overdue_id
    FROM public.create_loan(
      v_cust_id,
      'SEED-OVERDUE',
      NULL,
      2000000, -- 20,000 INR in paise
      300,
      v_overdue_on,
      'retail'::public.interest_model,
      NULL,
      '[
        {"metal":"gold","ornament_type":"Gold bangle","gross_weight_mg":8000,"net_weight_mg":8000,"purity_karat":22,"quantity":1}
      ]'::jsonb
    );
  END IF;

  -- There is no record_payment RPC; the app inserts into payments (logPayment).
  -- Seed as postgres (RLS would refuse without a shop JWT + authenticated role).
  IF v_active_id IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM public.payments WHERE loan_id = v_active_id
     ) THEN
    INSERT INTO public.payments (loan_id, amount_paid_paise, paid_on)
    VALUES (v_active_id, 150000, v_today); -- 1,500 INR in paise
  END IF;
END
$$;
