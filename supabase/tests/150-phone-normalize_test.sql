-- Lockstep: toE164India in src/lib/phone.ts must match normalize_phone_e164.
-- Expected strings are the current TypeScript outputs, including the known
-- leading-zero mangling. If these fail, stop — do not "fix" SQL in this pass.
begin;
select plan(5);

select is(
  public.normalize_phone_e164('9876543210'),
  '+919876543210',
  'a 10-digit number becomes +91XXXXXXXXXX'
);

select is(
  public.normalize_phone_e164('09876543210'),
  '+09876543210',
  'a 0-prefixed number is mangled the same way as toE164India'
);

select is(
  public.normalize_phone_e164('+919876543210'),
  '+919876543210',
  'a +91 number is unchanged'
);

select is(
  public.normalize_phone_e164('919876543210'),
  '+919876543210',
  'a 91 number without + becomes +91XXXXXXXXXX'
);

select is(
  public.normalize_phone_e164('+91 98765-43210'),
  '+919876543210',
  'spaces and dashes are stripped'
);

select * from finish();
rollback;
